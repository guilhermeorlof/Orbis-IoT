// ==============================
// MANUTENÇÃO PREDITIVA - ESP-32
// MPU6050 (Acelerômetro) + DHT11 (Temperatura)
// ==============================

// Libera memória antes de tudo
E.setFlags({pretokenise: 1});

// --- CONFIGURAÇÃO DA API ---
var API_HOST = "orbis-5hnn.onrender.com";
var API_PORT = 443;
var API_PATH = "/leituras";
var API_KEY  = "42d81369cc2efc749d6c852c";

// --- CONEXÃO WIFI ---
var wifi = require("Wifi");
var wifiConectado = false;

wifi.connect("iPhone", { password: "1604iphone" }, function(err) {
  if (err) {
    console.log("Erro WiFi: " + err);
    return;
  }
  wifiConectado = true;
  console.log("WiFi OK! IP: " + wifi.getIP());
});

// --- INICIALIZAÇÃO DOS SENSORES ---
I2C1.setup({scl: 22, sda: 21});
var mpu = require("MPU6050").connect(I2C1);

var dht = require("dht11certo.js").connect(32);

// --- CONFIGURAÇÕES DO MPU6050 ---
var sensib = 16384;
var ruido  = 0.5;

// --- ESTADO DA CALIBRAÇÃO ---
var g_calibrado = 0;
var pronto      = false;
var cal_cont    = 0;
var cal_soma    = 0;

// --- BUFFERS DE LEITURA ---
var vibracoes    = [];
var temperaturas = [];


// --- CALIBRAÇÃO ---
function calibrarMPU() {
  var acc   = mpu.getAcceleration();
  var z_ms2 = (acc[2] / sensib) * 9.806;
  cal_soma += z_ms2;
  cal_cont++;
  if (cal_cont >= 100) {
    g_calibrado = cal_soma / 100;
    pronto      = true;
    cal_soma    = 0; // libera memória
    console.log("\nCALIBRACAO CONCLUIDA!");
    console.log("Zero: " + g_calibrado.toFixed(4) + " m/s2\n");
  }
}


// --- LEITURA MPU6050 (100ms) ---
function lerMPU() {
  if (!pronto) { calibrarMPU(); return; }

  var acc    = mpu.getAcceleration();
  var v_pura = ((acc[2] / sensib) * 9.806) - g_calibrado;
  if (Math.abs(v_pura) < ruido) v_pura = 0;
  vibracoes.push(v_pura);
}


// --- LEITURA DHT11 (1000ms) ---
function lerDHT() {
  if (!pronto) return;
  var temp = dht.readTemperature();
  if (!isNaN(temp)) {
    temperaturas.push(temp);
  }
}


// --- ENVIO PARA API ---
function enviarParaAPI(vibracao, temperatura, status) {
  if (!wifiConectado) {
    console.log("(sem WiFi, ignorado)");
    return;
  }

  var body = JSON.stringify({
    vibracao_rms: vibracao,
    temperatura:  temperatura,
    status:       status,
    timestamp:    Date.now()
  });

  // ✅ require("http") com protocol "https:" — TLS nativo do ESP32
  var req = require("http").request({
    host:     API_HOST,
    port:     API_PORT,
    path:     API_PATH,
    method:   "POST",
    protocol: "https:",
    headers: {
      "Content-Type":   "application/json",
      "x-api-key":      API_KEY,
      "Content-Length": body.length
    }
  }, function(res) {
    console.log("Enviado: " + res.statusCode);
    res.on('data', function(d) { console.log("Resp: " + d); });
  });

  req.on('error', function(err) { console.log("Erro: " + err); });
  req.end(body);
}


// --- CALCULAR E ENVIAR (5000ms) ---
function calcularMedias() {
  if (vibracoes.length === 0 && temperaturas.length === 0) return;

  var v_rms = 0;
  if (vibracoes.length > 0) {
    var soma_q = 0;
    for (var i = 0; i < vibracoes.length; i++) soma_q += vibracoes[i] * vibracoes[i];
    v_rms = Math.sqrt(soma_q / vibracoes.length) * 10;
    if (v_rms < 0.1) v_rms = 0;
  }

  var t_media = 0;
  if (temperaturas.length > 0) {
    var soma_t = 0;
    for (var j = 0; j < temperaturas.length; j++) soma_t += temperaturas[j];
    t_media = soma_t / temperaturas.length;
  }

  console.log("---------------------------------------");
  console.log("Vibracao: " + v_rms.toFixed(2) + " mm/s (" + vibracoes.length + " amostras)");
  console.log("Temp:     " + t_media.toFixed(2) + " C (" + temperaturas.length + " amostras)");
  console.log("---------------------------------------");

  // Limpa ANTES de enviar para liberar memória para o request
  vibracoes    = [];
  temperaturas = [];

  enviarParaAPI(v_rms, t_media, "online");
}


// --- INTERVALOS ---
setInterval(lerMPU,         100);
setInterval(lerDHT,        1000);
setInterval(calcularMedias, 5000);

console.log("\nSistema iniciando...");
console.log("Aguarde calibracao...\n");