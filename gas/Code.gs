/**
 * 金煎堂｜線上訂單 API（Google Apps Script）
 *
 * 網站結帳 → POST 到這支 Web App → 驗證、重新計算金額 → 寫入 Google Sheet → 寄通知信 → 回傳訂單編號
 *
 * 安裝步驟請見 gas/README.md。
 * 第一次使用：在編輯器選擇 setup 函式並執行一次（建立工作表、標題列、狀態下拉選單）。
 */

/* ================= 設定 ================= */
const CONFIG = {
  NOTIFY_EMAIL: '',            // 新訂單通知寄到哪裡；留空 = 部署者本人的 Gmail
  SEND_CUSTOMER_EMAIL: true,   // 顧客有填 Email 時，寄送訂單確認信
  SHIPPING_FEE: 150,           // 冷凍宅配運費
  FREE_SHIP_THRESHOLD: 1500,   // 滿額免運
  SHOP_NAME: '金煎堂',
};

// 商品與價格（以這裡為準計算金額；網站改價時，這裡也要一起改）
const PRODUCTS = {
  p01: ['招牌豬肉鍋貼', '10 顆', 80],
  p02: ['韭黃鮮蝦鍋貼', '10 顆', 120],
  p03: ['麻辣牛肉鍋貼', '10 顆', 130],
  p04: ['高麗菜豬肉鍋貼', '10 顆', 75],
  p05: ['鮮肉水餃', '10 顆', 70],
  p06: ['玉米豬肉水餃', '10 顆', 75],
  p07: ['酸菜白肉水餃', '10 顆', 85],
  p08: ['紅油抄手', '8 顆', 90],
  p09: ['酸辣湯', '碗', 45],
  p10: ['玉米蛋花湯', '碗', 40],
  p11: ['古早味紅茶', '杯', 30],
  p12: ['無糖濃豆漿', '杯', 35],
  p13: ['涼拌小黃瓜', '份', 40],
  p14: ['滷豆干海帶', '份', 35],
  p15: ['皮蛋豆腐', '份', 50],
  p16: ['麻醬燙青菜', '份', 45],
  g01: ['招財鍋貼禮盒', '50 入', 680],
  g02: ['闔家團圓水餃組', '100 入', 880],
  g03: ['節慶雙享伴手禮盒', '60 入', 990],
};

const STORES = { s1: '旗艦總店', s2: '信義店', s3: '板橋店' };
const MODES = { dinein: '內用', takeout: '外帶自取', delivery: '冷凍宅配' };
const PAYS = ['現場付款', '信用卡', 'LINE Pay'];

const SHEET_ORDERS = '訂單';
const SHEET_ITEMS = '訂單明細';
const ORDER_HEADERS = ['訂單編號', '建立時間', '狀態', '取餐方式', '姓名', '手機', 'Email', '門市', '取餐／到店時間', '人數',
  '收件地址', '希望到貨日', '付款方式', '小計', '運費', '總金額', '品項摘要', '備註'];
const ITEM_HEADERS = ['訂單編號', '建立時間', '商品編號', '品名', '規格', '單價', '數量', '小計'];
const STATUSES = ['新訂單', '製作中', '可取餐／已出貨', '已完成', '已取消'];
const STATUS_COLORS = { '新訂單': '#FDE7D2', '製作中': '#FFF4C2', '可取餐／已出貨': '#DDEFD9', '已完成': '#E6E6E6', '已取消': '#F6D5D2' };

/* ================= Web App 入口 ================= */
function doGet() {
  return json({ ok: true, service: CONFIG.SHOP_NAME + ' 訂單 API' });
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.website) return json({ ok: true, orderNo: '-' });   // 機器人陷阱欄位：有值就直接忽略

    const order = buildOrder(data);
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      order.no = nextOrderNo(order.createdAt);
      writeOrder(order);
    } finally {
      lock.releaseLock();
    }
    try { notify(order); } catch (mailErr) { console.warn('寄信失敗', mailErr); }
    return json({ ok: true, orderNo: order.no, total: order.total });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ================= 驗證與計算 ================= */
function buildOrder(d) {
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const o = {
    createdAt: new Date(),
    mode: str(d.mode, 20),
    name: str(d.name, 50),
    phone: str(d.phone, 20),
    email: str(d.email, 120),
    store: str(d.store, 10),
    time: str(d.time, 30),
    guests: str(d.guests, 20),
    address: str(d.address, 200),
    date: str(d.date, 20),
    pay: str(d.pay, 20),
    note: str(d.note, 500),
  };
  if (!MODES[o.mode]) throw new Error('取餐方式不正確');
  if (!o.name) throw new Error('請填寫姓名');
  if (!/^09\d{8}$/.test(o.phone)) throw new Error('手機號碼格式不正確');
  if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) throw new Error('Email 格式不正確');
  if (PAYS.indexOf(o.pay) < 0) throw new Error('付款方式不正確');
  if (o.mode === 'delivery') {
    if (o.address.length < 6) throw new Error('請填寫完整收件地址');
    o.store = ''; o.time = ''; o.guests = '';
  } else {
    if (!STORES[o.store]) throw new Error('請選擇門市');
    o.address = ''; o.date = '';
    if (o.mode !== 'dinein') o.guests = '';
  }

  if (!Array.isArray(d.items) || !d.items.length) throw new Error('購物車是空的');
  if (d.items.length > 50) throw new Error('品項過多');
  o.items = d.items.map((it) => {
    const p = PRODUCTS[String(it.id)];
    const qty = Number(it.qty);
    if (!p) throw new Error('找不到商品：' + it.id);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error('數量不正確');
    return { id: String(it.id), name: p[0], unit: p[1], price: p[2], qty: qty, sum: p[2] * qty };
  });
  o.subtotal = o.items.reduce((s, it) => s + it.sum, 0);
  o.shipping = o.mode === 'delivery' && o.subtotal < CONFIG.FREE_SHIP_THRESHOLD ? CONFIG.SHIPPING_FEE : 0;
  o.total = o.subtotal + o.shipping;
  return o;
}

// 訂單編號：JJT + 年月日 + 當日流水號，例如 JJT261127-003
function nextOrderNo(date) {
  const day = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyMMdd');
  const props = PropertiesService.getScriptProperties();
  const key = 'seq_' + day;
  const n = Number(props.getProperty(key) || 0) + 1;
  props.setProperty(key, String(n));
  return 'JJT' + day + '-' + ('00' + n).slice(-3);
}

/* ================= 寫入試算表 ================= */
function writeOrder(o) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orders = ss.getSheetByName(SHEET_ORDERS) || setup().orders;
  const items = ss.getSheetByName(SHEET_ITEMS);
  const summary = o.items.map((it) => it.name + '×' + it.qty).join('、');
  orders.appendRow([
    o.no, o.createdAt, STATUSES[0], MODES[o.mode], safe(o.name), "'" + o.phone, safe(o.email),
    STORES[o.store] || '', safe(o.time), safe(o.guests), safe(o.address), safe(o.date), o.pay,
    o.subtotal, o.shipping, o.total, summary, safe(o.note),
  ]);
  items.getRange(items.getLastRow() + 1, 1, o.items.length, ITEM_HEADERS.length).setValues(
    o.items.map((it) => [o.no, o.createdAt, it.id, it.name, it.unit, it.price, it.qty, it.sum])
  );
}

// 防止顧客輸入的文字被試算表當成公式執行
function safe(v) {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

/* ================= 通知信 ================= */
function notify(o) {
  const rows = o.items.map((it) =>
    '<tr><td>' + esc(it.name) + '（' + esc(it.unit) + '）</td><td align="right">× ' + it.qty + '</td><td align="right">$' + it.sum + '</td></tr>'
  ).join('');
  const where = o.mode === 'delivery'
    ? '收件地址：' + esc(o.address) + (o.date ? '<br>希望到貨日：' + esc(o.date) : '')
    : '門市：' + STORES[o.store] + '<br>時間：' + esc(o.time) + (o.guests ? '<br>人數：' + esc(o.guests) : '');
  const body =
    '<div style="font-family:sans-serif;color:#3E2A1F;max-width:520px">' +
    '<h2 style="margin:0 0 8px">' + CONFIG.SHOP_NAME + '｜訂單 ' + o.no + '</h2>' +
    '<p>' + MODES[o.mode] + '｜' + o.pay + '</p>' +
    '<p>' + esc(o.name) + '　' + o.phone + (o.email ? '　' + esc(o.email) : '') + '</p>' +
    '<p>' + where + '</p>' +
    '<table cellpadding="6" style="border-collapse:collapse;width:100%;border-top:1px solid #ddd">' + rows + '</table>' +
    '<p style="text-align:right">小計 $' + o.subtotal + (o.shipping ? '　運費 $' + o.shipping : '') + '<br><b style="font-size:18px">總計 $' + o.total + '</b></p>' +
    (o.note ? '<p>備註：' + esc(o.note) + '</p>' : '') +
    '</div>';

  const shopTo = CONFIG.NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  if (shopTo) {
    MailApp.sendEmail({ to: shopTo, subject: '【新訂單】' + o.no + '｜' + MODES[o.mode] + '｜$' + o.total, htmlBody: body, name: CONFIG.SHOP_NAME + ' 訂單系統', replyTo: o.email || undefined });
  }
  if (CONFIG.SEND_CUSTOMER_EMAIL && o.email) {
    MailApp.sendEmail({ to: o.email, subject: '【' + CONFIG.SHOP_NAME + '】已收到您的訂單 ' + o.no, htmlBody: '<p>' + esc(o.name) + ' 您好，感謝您的訂購！以下是您的訂單明細：</p>' + body, name: CONFIG.SHOP_NAME });
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ================= 初始化（執行一次） ================= */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const make = (name, headers, widths) => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#3E2A1F').setFontColor('#F7F1E8');
    sh.setFrozenRows(1);
    widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
    return sh;
  };
  const orders = make(SHEET_ORDERS, ORDER_HEADERS, [130, 150, 110, 90, 90, 110, 170, 90, 130, 70, 220, 100, 90, 70, 60, 80, 260, 200]);
  const items = make(SHEET_ITEMS, ITEM_HEADERS, [130, 150, 80, 150, 70, 60, 60, 70]);

  orders.getRange('B2:B').setNumberFormat('yyyy/mm/dd hh:mm');
  items.getRange('B2:B').setNumberFormat('yyyy/mm/dd hh:mm');
  orders.getRange('F2:F').setNumberFormat('@');
  ['N2:P'].forEach((a) => orders.getRange(a).setNumberFormat('$#,##0'));
  items.getRange('F2:F').setNumberFormat('$#,##0');
  items.getRange('H2:H').setNumberFormat('$#,##0');

  // 狀態下拉選單 + 顏色
  const statusRange = orders.getRange('C2:C');
  statusRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  orders.setConditionalFormatRules(STATUSES.map((s) =>
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(STATUS_COLORS[s]).setRanges([statusRange]).build()
  ));

  const first = ss.getSheets()[0];
  if (first.getName() !== SHEET_ORDERS && first.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(first);
  return { orders: orders, items: items };
}

/* ================= 測試用：在編輯器執行，確認寫入與寄信正常 ================= */
function testOrder() {
  const res = doPost({ postData: { contents: JSON.stringify({
    mode: 'takeout', name: '測試訂單', phone: '0912345678', email: '', store: 's1', time: '今天 18:00',
    pay: '現場付款', note: '這是測試訂單，可刪除', items: [{ id: 'p01', qty: 2 }, { id: 'p09', qty: 1 }],
  }) } });
  console.log(res.getContent());
}
