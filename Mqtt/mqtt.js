// ==============================
// MANUTENÇÃO PREDITIVA - ESP-32
// MPU6050 (Acelerômetro) + DHT11 (Temperatura)
// Protocolo: MQTT over TLS (HiveMQ Cloud)
// ==============================

E.setFlags({pretokenise: 1});

// =========================================
// CONFIGURAÇÕES — edite apenas aqui
// =========================================

var WIFI_SSID  = "iPhone";
var WIFI_PASS  = "1604iphone";

var MQTT_HOST  = "b3ff96d5080549f38b52a78be47c8cd0.s1.eu.hivemq.cloud";
var MQTT_PORT  = 8883;             // TLS obrigatório no HiveMQ Cloud
var MQTT_ID    = "esp32-orbis-01"; // ID único do dispositivo
var MQTT_USER  = "ESP32";
var MQTT_PASS  = "Jogadordepeteca28";
var MQTT_TOPIC = "orbis/leituras";

// =========================================


// --- ESTADO GLOBAL ---
var mqttConectado = false;
var mqtt          = null;

// --- CALIBRAÇÃO ---
var g_calibrado = 0;
var pronto      = false;
var cal_cont    = 0;
var cal_soma    = 0;

// --- BUFFERS DE LEITURA ---
var vibracoes    = [];
var temperaturas = [];

// --- CONFIGURAÇÕES DO MPU6050 ---
var sensib = 16384; // Sensibilidade ±2g
var ruido  = 0.5;   // Banda morta em m/s²


// =========================================
// 1. WIFI
// =========================================

var wifi = require("Wifi");

wifi.connect(WIFI_SSID, {password: WIFI_PASS}, function(err) {
  if (err) {
    console.log("[WiFi] Erro: " + err);
    return;
  }
  console.log("[WiFi] Conectado! IP: " + wifi.getIP());
  conectarMQTT();
});


// =========================================
// 2. MQTT
// =========================================

function conectarMQTT() {
  console.log("[MQTT] Conectando em " + MQTT_HOST + "...");

  mqtt = require("MQTT").connect({
    host:      MQTT_HOST,
    port:      MQTT_PORT,
    client_id: MQTT_ID,
    username:  MQTT_USER,
    password:  MQTT_PASS,
    tls:       true        // TLS obrigatório no HiveMQ Cloud
  });

  mqtt.on("connected", function() {
    mqttConectado = true;
    console.log("[MQTT] Conectado! Topico: " + MQTT_TOPIC);
  });

  mqtt.on("disconnected", function() {
    mqttConectado = false;
    console.log("[MQTT] Desconectado. Reconectando em 5s...");
    setTimeout(conectarMQTT, 5000);
  });

  mqtt.on("error", function(err) {
    console.log("[MQTT] Erro: " + err);
  });
}


// =========================================
// 3. SENSORES
// =========================================

I2C1.setup({scl: 22, sda: 21});
var mpu = require("MPU6050").connect(I2C1);
var dht = require("dht11certo.js").connect(32);


// --- Calibração do MPU6050 ---
function calibrarMPU() {
  var z = (mpu.getAcceleration()[2] / sensib) * 9.806;
  cal_soma += z;
  cal_cont++;

  if (cal_cont >= 100) {
    g_calibrado = cal_soma / 100;
    pronto      = true;
    cal_soma    = 0;
    console.log("[MPU] Calibracao concluida! Zero: " + g_calibrado.toFixed(4) + " m/s2");
  }
}

// --- Leitura MPU6050 (a cada 100ms) ---
function lerMPU() {
  if (!pronto) { calibrarMPU(); return; }

  var v = ((mpu.getAcceleration()[2] / sensib) * 9.806) - g_calibrado;
  vibracoes.push(Math.abs(v) < ruido ? 0 : v);
}

// --- Leitura DHT11 (a cada 1000ms) ---
function lerDHT() {
  if (!pronto) return;

  var t = dht.readTemperature();
  if (!isNaN(t)) temperaturas.push(t);
}


// =========================================
// 4. PUBLICAÇÃO MQTT (a cada 5 segundos)
// =========================================

function publicarLeitura() {
  if (vibracoes.length === 0 && temperaturas.length === 0) return;

  // Calcula vibração RMS
  var v_rms = 0;
  if (vibracoes.length > 0) {
    var sq = 0;
    for (var i = 0; i < vibracoes.length; i++) sq += vibracoes[i] * vibracoes[i];
    v_rms = Math.sqrt(sq / vibracoes.length) * 10;
    if (v_rms < 0.1) v_rms = 0;
  }

  // Calcula temperatura média
  var t_media = 0;
  if (temperaturas.length > 0) {
    var st = 0;
    for (var j = 0; j < temperaturas.length; j++) st += temperaturas[j];
    t_media = st / temperaturas.length;
  }

  // Exibe no console
  console.log("----------------------------");
  console.log("Vibracao: " + v_rms.toFixed(2) + " mm/s");
  console.log("Temp:     " + t_media.toFixed(2) + " C");
  console.log("----------------------------");

  // Limpa buffers ANTES de publicar (libera RAM)
  vibracoes    = [];
  temperaturas = [];

  // Publica se MQTT estiver conectado
  if (!mqttConectado) {
    console.log("[MQTT] Sem conexao, leitura descartada.");
    return;
  }

  var payload = JSON.stringify({
    vibracao_rms: v_rms,
    temperatura:  t_media,
    status:       "online",
    timestamp:    Date.now()
  });

  mqtt.publish(MQTT_TOPIC, payload);
  console.log("[MQTT] Publicado em: " + MQTT_TOPIC);
}


// =========================================
// 5. INTERVALOS
// =========================================

setInterval(lerMPU,          100); // MPU6050: a cada 100ms
setInterval(lerDHT,         1000); // DHT11:   a cada 1 segundo
setInterval(publicarLeitura, 5000); // MQTT:    a cada 5 segundos

console.log("\n[SYS] Sistema iniciando...");
console.log("[SYS] Aguarde calibracao do MPU6050...\n");