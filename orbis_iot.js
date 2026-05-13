// ==============================
// MANUTENCAO PREDITIVA - ESP-32
// MPU6050 + DHT11 - MQTT HiveMQ Public
// ==============================

var WIFI_SSID  = "iPhone";
var WIFI_PASS  = "1604iphone";
var MQTT_HOST  = "broker.hivemq.com";
var MQTT_PORT  = 1883;
var MQTT_ID    = "esp32-orbis-" + (Math.random() * 10000 | 0);
var MQTT_TOPIC = "orbis/leituras";

var MQTT_MOD = require("MQTT");
var wifi     = require("Wifi");

I2C1.setup({scl: 22, sda: 21});
var mpu = null;
var dht = null;

try {
  mpu = require("MPU6050").connect(I2C1);
} catch(e) {}

try {
  dht = require("dht11.js").connect(32);
} catch(e) {}

var mqttConectado = false;
var mqtt = null;
var g_calibrado = 0;
var pronto = false;
var cal_cont = 0;
var cal_soma = 0;
var vibracoes = [];
var temperaturas = [];
var sensib = 16384;
var ruido = 0.5;
var ultimaLeituraDHT = 0;
var id_sensor = 3;


// =========================================
// WIFI
// =========================================

wifi.on('connected', function() {
  console.log("[WiFi] Conectado");
  setTimeout(conectarMQTT, 1000);
});

wifi.on('disconnected', function() {
  mqttConectado = false;
  console.log("[WiFi] Desconectado");
  setTimeout(function() {
    wifi.connect(WIFI_SSID, {password: WIFI_PASS});
  }, 5000);
});


// =========================================
// MQTT
// =========================================

function conectarMQTT() {
  try {
    mqtt = MQTT_MOD.connect({
      host: MQTT_HOST,
      port: MQTT_PORT,
      client_id: MQTT_ID,
      keep_alive: 60
    });

    mqtt.on("connected", function() {
      mqttConectado = true;
      console.log("[MQTT] Conectado");
    });

    mqtt.on("disconnected", function() {
      mqttConectado = false;
      setTimeout(conectarMQTT, 5000);
    });

    mqtt.on("error", function(err) {
      console.log("[MQTT] Erro");
    });
  } catch(e) {
    setTimeout(conectarMQTT, 5000);
  }
}


// =========================================
// SENSORES
// =========================================

function calibrarMPU() {
  if (!mpu) return;
  
  try {
    var z = (mpu.getAcceleration()[2] / sensib) * 9.806;
    cal_soma += z;
    cal_cont++;
    if (cal_cont >= 100) {
      g_calibrado = cal_soma / 100;
      pronto = true;
      console.log("[MPU] Calibrado");
    }
  } catch(e) {}
}

function lerMPU() {
  if (!pronto) {
    calibrarMPU();
    return;
  }
  
  if (!mpu) return;
  
  try {
    var v = ((mpu.getAcceleration()[2] / sensib) * 9.806) - g_calibrado;
    vibracoes.push(Math.abs(v) < ruido ? 0 : v);
  } catch(e) {}
}

function lerDHT() {
  if (!pronto || !dht) return;
  
  try {
    var t = dht.readTemperature();
    if (!isNaN(t) && t > -50 && t < 100) {
      temperaturas.push(t);
    }
  } catch(e) {}
}


// =========================================
// PUBLICACAO
// =========================================

function publicarLeitura() {
  if (!pronto) return;

  var v_rms = 0;
  if (vibracoes.length > 0) {
    var sq = 0;
    for (var i = 0; i < vibracoes.length; i++) {
      sq += vibracoes[i] * vibracoes[i];
    }
    v_rms = Math.sqrt(sq / vibracoes.length) * 10;
    if (v_rms < 0.1) v_rms = 0;
  }

  var t_media = 0;
  if (temperaturas.length > 0) {
    var st = 0;
    for (var j = 0; j < temperaturas.length; j++) {
      st += temperaturas[j];
    }
    t_media = st / temperaturas.length;
  }

  vibracoes = [];
  temperaturas = [];

  console.log("ID:"+id_sensor+ " V:" + v_rms.toFixed(2) + " T:" + t_media.toFixed(1) + " MQTT:" + (mqttConectado ? "OK" : "XX"));

  if (!mqttConectado || !mqtt) return;

  try {
    mqtt.publish(MQTT_TOPIC, JSON.stringify({
      sensorId: id_sensor,
      temperatura: t_media.toFixed(2),
      vibracao_rms: v_rms.toFixed(2)
     
    }));
  } catch(e) {}
}


// =========================================
// DEBUG
// =========================================

global.status = function() {
  console.log("WiFi:" + (wifi.isConnected() ? "OK" : "XX"));
  console.log("MQTT:" + (mqttConectado ? "OK" : "XX"));
  console.log("Pronto:" + (pronto ? "SIM" : "NAO"));
};


// =========================================
// START
// =========================================

console.log("[SYS] Iniciando");
wifi.connect(WIFI_SSID, {password: WIFI_PASS});

setInterval(lerMPU, 100);
setInterval(lerDHT, 2000);
setInterval(publicarLeitura, 5000);