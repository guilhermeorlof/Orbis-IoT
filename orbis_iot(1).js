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
var BOTAO_REINICIO = typeof D26 !== "undefined" ? D26 : 26; // Botao entre GPIO26 e GND.

var MQTT_MOD = require("MQTT");
var wifi     = require("Wifi");

I2C1.setup({scl: 22, sda: 21});
var mpu = null;
var dht = null;

try {
  mpu = require("MPU6050").connect(I2C1);
} catch(e) {}

try {
  dht = require("dht11.js").connect(25);
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
var id_sensor = 0;
var sistemaAtivo = false;
var wifiPreparado = false;
var conectandoWiFi = false;
var intervalos = [];
var temporizadores = [];
var watchBotao = null;
var pollingBotao = null;
var estadoBotaoAnterior = 1;
var ultimoCliqueBotao = 0;


// =========================================
// WIFI
// =========================================

wifi.on('connected', function() {
  if (!sistemaAtivo) return;
  console.log("[WiFi] Conectado");
  agendar(conectarMQTT, 1000);
});

wifi.on('disconnected', function() {
  if (!sistemaAtivo) return;
  mqttConectado = false;
  console.log("[WiFi] Desconectado");
  agendar(conectarWiFi, 5000);
});

function conectarWiFi() {
  if (!sistemaAtivo || conectandoWiFi) return;
  
  conectandoWiFi = true;
  
  if (!wifiPreparado && wifi.stopAP) {
    try {
      wifi.stopAP(function() {
        wifiPreparado = true;
        conectandoWiFi = false;
        agendar(conectarWiFi, 1500);
      });
      return;
    } catch(e) {
      wifiPreparado = true;
    }
  }
  
  try {
    wifi.connect(WIFI_SSID, {password: WIFI_PASS}, function(err) {
      conectandoWiFi = false;
      if (err) {
        console.log("[WiFi] Falha ao conectar, tentando novamente");
        agendar(conectarWiFi, 5000);
      }
    });
  } catch(e) {
    conectandoWiFi = false;
    console.log("[WiFi] Erro ao iniciar conexao, tentando novamente");
    agendar(conectarWiFi, 5000);
  }
}


// =========================================
// MQTT
// =========================================

function conectarMQTT() {
  if (!sistemaAtivo) return;
  
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
      if (!sistemaAtivo) return;
      mqttConectado = false;
      agendar(conectarMQTT, 5000);
    });

    mqtt.on("error", function(err) {
      console.log("[MQTT] Erro");
    });
  } catch(e) {
    agendar(conectarMQTT, 5000);
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
  if (!sistemaAtivo || !pronto) return;

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

function agendar(fn, tempo) {
  var id = setTimeout(fn, tempo);
  temporizadores.push(id);
  return id;
}

function repetir(fn, tempo) {
  var id = setInterval(fn, tempo);
  intervalos.push(id);
  return id;
}

function limparTempos() {
  for (var i = 0; i < intervalos.length; i++) {
    clearInterval(intervalos[i]);
  }
  
  for (var j = 0; j < temporizadores.length; j++) {
    clearTimeout(temporizadores[j]);
  }
  
  intervalos = [];
  temporizadores = [];
}

function limparLeituras() {
  g_calibrado = 0;
  pronto = false;
  cal_cont = 0;
  cal_soma = 0;
  vibracoes = [];
  temperaturas = [];
}

function pararSistema() {
  sistemaAtivo = false;
  conectandoWiFi = false;
  mqttConectado = false;
  limparTempos();
  
  try {
    if (mqtt && mqtt.disconnect) mqtt.disconnect();
  } catch(e) {}
  
  mqtt = null;
  
  try {
    wifi.disconnect();
  } catch(e) {}
}

function iniciarSistema() {
  console.log("[SYS] Iniciando");
  sistemaAtivo = true;
  limparLeituras();
  conectarWiFi();
  
  repetir(lerMPU, 100);
  repetir(lerDHT, 2000);
  repetir(publicarLeitura, 5000);
}

function reiniciarSistema() {
  console.log("[SYS] Reiniciando pelo botao");
  pararSistema();
  agendar(iniciarSistema, 4000);
}

global.reiniciarSistema = reiniciarSistema;

function lerBotaoReinicio() {
  try {
    return digitalRead(BOTAO_REINICIO);
  } catch(e) {
    return 1;
  }
}

function botaoReinicioPressionado() {
  var agora = getTime();
  if (agora - ultimoCliqueBotao < 1.5) return;
  
  ultimoCliqueBotao = agora;
  console.log("[BTN] Botao pressionado");
  reiniciarSistema();
}

function verificarBotaoReinicio() {
  var estado = lerBotaoReinicio();
  
  if (estado === 0 && estadoBotaoAnterior === 1) {
    botaoReinicioPressionado();
  }
  
  estadoBotaoAnterior = estado;
}

global.testarBotao = function() {
  console.log("[BTN] Leitura:" + lerBotaoReinicio() + " (solto=1, apertado=0)");
};

function configurarBotaoReinicio() {
  try {
    if (watchBotao !== null) clearWatch(watchBotao);
    if (pollingBotao !== null) clearInterval(pollingBotao);
    if (global._orbisBotaoInterval) clearInterval(global._orbisBotaoInterval);
    
    pinMode(BOTAO_REINICIO, "input_pullup");
    estadoBotaoAnterior = lerBotaoReinicio();
    
    try {
      watchBotao = setWatch(function() {
        console.log("[BTN] Pulso detectado por setWatch");
        botaoReinicioPressionado();
      }, BOTAO_REINICIO, {
        repeat: true,
        edge: "falling",
        debounce: 300
      });
    } catch(e) {
      console.log("[BTN] setWatch indisponivel, usando leitura por intervalo");
    }
    
    pollingBotao = setInterval(verificarBotaoReinicio, 100);
    global._orbisBotaoInterval = pollingBotao;
    
    console.log("[BTN] Botao de reinicio configurado no GPIO26");
  } catch(e) {
    console.log("[BTN] Erro ao configurar botao");
  }
}

configurarBotaoReinicio();
iniciarSistema();
