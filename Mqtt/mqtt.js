// ==============================
// MANUTENÇÃO PREDITIVA - ESP-32
// MPU6050 + DHT11 — MQTT HiveMQ Public
// ==============================

E.setFlags({pretokenise: 1}); // economiza RAM tokenizando o código

var WIFI_SSID  = "iPhone";
var WIFI_PASS  = "1604iphone";
var MQTT_HOST  = "broker.hivemq.com";
var MQTT_PORT  = 1883;
var MQTT_ID    = "esp32-orbis-" + (Math.random() * 10000 | 0);
var MQTT_TOPIC = "orbis/leituras";

// --- Carrega módulos ANTES de qualquer coisa (evita OOM tardio) ---
var MQTT_MOD = require("MQTT");
var wifi     = require("Wifi");
I2C1.setup({scl: 22, sda: 21});
var mpu = require("MPU6050").connect(I2C1);
var dht = require("dht11certo.js").connect(32);

// --- Estado ---
var mqttConectado = false;
var mqtt          = null;
var g_calibrado   = 0;
var pronto        = false;
var cal_cont      = 0;
var cal_soma      = 0;
var vibracoes     = [];
var temperaturas  = [];
var sensib        = 16384;
var ruido         = 0.5;


// =========================================
// WIFI
// =========================================

wifi.on('connected', function() {
  console.log("[WiFi] Conectado!");
  setTimeout(conectarMQTT, 1000);
});

wifi.on('disconnected', function() {
  mqttConectado = false;
  console.log("[WiFi] Desconectado. Reconectando...");
  setTimeout(function() {
    wifi.connect(WIFI_SSID, {password: WIFI_PASS});
  }, 5000);
});


// =========================================
// MQTT
// =========================================

function conectarMQTT() {
  console.log("[MQTT] Conectando...");

  mqtt = MQTT_MOD.connect({
    host:       MQTT_HOST,
    port:       MQTT_PORT,
    client_id:  MQTT_ID,
    keep_alive: 60
  });

  mqtt.on("connected", function() {
    mqttConectado = true;
    console.log("[MQTT] Conectado!");
  });

  mqtt.on("disconnected", function() {
    mqttConectado = false;
    console.log("[MQTT] Desconectado. Reconectando...");
    setTimeout(conectarMQTT, 5000);
  });

  mqtt.on("error", function(err) {
    console.log("[MQTT] Erro: " + err);
  });
}


// =========================================
// SENSORES
// =========================================

function calibrarMPU() {
  var z = (mpu.getAcceleration()[2] / sensib) * 9.806;
  cal_soma += z;
  cal_cont++;
  if (cal_cont >= 100) {
    g_calibrado = cal_soma / 100;
    pronto      = true;
    cal_soma    = 0;
    console.log("[MPU] Calibrado: " + g_calibrado.toFixed(4) + " m/s2");
  }
}

function lerMPU() {
  if (!pronto) { calibrarMPU(); return; }
  var v = ((mpu.getAcceleration()[2] / sensib) * 9.806) - g_calibrado;
  vibracoes.push(Math.abs(v) < ruido ? 0 : v);
}

function lerDHT() {
  if (!pronto) return;
  var t = dht.readTemperature();
  if (!isNaN(t)) temperaturas.push(t);
}


// =========================================
// PUBLICAÇÃO
// =========================================

function publicarLeitura() {
  if (!pronto) return;

  var v_rms = 0;
  if (vibracoes.length > 0) {
    var sq = 0;
    for (var i = 0; i < vibracoes.length; i++) sq += vibracoes[i] * vibracoes[i];
    v_rms = Math.sqrt(sq / vibracoes.length) * 10;
    if (v_rms < 0.1) v_rms = 0;
  }

  var t_media = 0;
  if (temperaturas.length > 0) {
    var st = 0;
    for (var j = 0; j < temperaturas.length; j++) st += temperaturas[j];
    t_media = st / temperaturas.length;
  }

  vibracoes    = [];
  temperaturas = [];

  console.log("Vib: " + v_rms.toFixed(2) + " mm/s | Temp: " + t_media.toFixed(1) + " C | MQTT: " + (mqttConectado ? "OK" : "off"));

  if (!mqttConectado) return;

  mqtt.publish(MQTT_TOPIC, JSON.stringify({
    vibracao_rms: v_rms,
    temperatura:  t_media,
    status:       "online",
    ts:           Date.now()
  }));
  console.log("[MQTT] Publicado!");
}


// =========================================
// START
// =========================================

console.log("[SYS] Iniciando... RAM livre: " + process.memory().free);
wifi.connect(WIFI_SSID, {password: WIFI_PASS});

setInterval(lerMPU,          100);
setInterval(lerDHT,         2000); // DHT reduzido p/ 2s (libera RAM)
setInterval(publicarLeitura, 5000);