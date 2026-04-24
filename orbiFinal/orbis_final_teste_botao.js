// ==============================
// MANUTENÇÃO PREDITIVA - ESP-32
// MPU6050 (Acelerômetro) + DHT11 (Temperatura)
// ==============================


// --- CONFIGURAÇÃO DA API ---
// ⚠️ Host SEM "http://" ou "https://" — só o domínio!
const API_HOST = "orbis-5hnn.onrender.com";
const API_PORT = 443;
const API_PATH = "/sensores";
const API_KEY  = "chavezinha-legal";

// --- CONFIGURAÇÃO DO BOTÃO ---
const BOTAO_PIN = 26;
let sistemaAtivo = false;  // Sistema inicia DESLIGADO

// Configura o pino do botão como entrada com pull-up
pinMode(BOTAO_PIN, 'input_pullup');

// Detecta pressionamento do botão (borda de descida = pressionado)
setWatch(function() {
  sistemaAtivo = !sistemaAtivo;

  if (sistemaAtivo) {
    console.log("\n========= SISTEMA LIGADO =========");
    console.log("Iniciando calibração do MPU6050...\n");
    return sistemaAtivo = true; // Garante que o sistema fique ativo
  } else {
    console.log("\n======= SISTEMA DESLIGADO ========\n");
    return sistemaAtivo = false; // Garante que o sistema fique desligado
  }
}, BOTAO_PIN, { repeat: true, edge: 'falling', debounce: 50 });
// debounce: 50ms evita múltiplos acionamentos por ruído elétrico


// --- INICIALIZAÇÃO DO WIFI + SENSORES ---
// Tudo começa aqui, só depois que o WiFi conectar
var wifi = require("Wifi");

wifi.connect("SEU_WIFI", { password: "SUA_SENHA" }, function(err) {
  if (err) {
    console.log("Erro ao conectar WiFi:", err);
    return; // Interrompe se não conectar
  }

  console.log("WiFi conectado!");
  console.log("IP:", wifi.getIP());

  // Inicializa sensores APÓS conexão WiFi
  iniciarSensores();
});


// --- FUNÇÃO PRINCIPAL: INICIALIZA SENSORES E INTERVALOS ---
function iniciarSensores() {

  // MPU6050 via I2C
  I2C1.setup({ scl: 22, sda: 21 });
  var mpu = require("MPU6050").connect(I2C1);

  // DHT11
  const DHT_PIN = 32;
  var dht = require("dht11certo.js").connect(DHT_PIN);

  // --- CONFIGURAÇÕES DO MPU6050 ---
  const sensib = 16384;  // Sensibilidade ±2g
  const ruido  = 0.5;    // Banda morta em m/s²

  // --- ESTADO DA CALIBRAÇÃO ---
  var g_calibrado = 0;
  var pronto      = false;
  var cal_cont    = 0;
  var cal_soma    = 0;

  // --- BUFFERS DE LEITURA (acumulam por 5 segundos) ---
  var vibracoes    = [];
  var temperaturas = [];


  // --- CALIBRAÇÃO DO MPU6050 ---
  function calibrarMPU() {
    var acc   = mpu.getAcceleration();
    var z_ms2 = (acc[2] / sensib) * 9.806;

    cal_soma += z_ms2;
    cal_cont++;

    if (cal_cont >= 100) {
      g_calibrado = cal_soma / 100;
      pronto      = true;
      console.log("CALIBRAÇÃO CONCLUÍDA!");
      console.log("  Zero gravidade: " + g_calibrado.toFixed(4) + " m/s²\n");
    }
  }


  // --- LEITURA DO MPU6050 (a cada 100ms) ---
  function lerMPU() {
    // Nenhuma ação enquanto o sistema estiver desligado
    if (!sistemaAtivo) return;

    // Calibra primeiro se ainda não estiver pronto
    if (!pronto) {
      calibrarMPU();
      return;
    }

    var acc   = mpu.getAcceleration();
    var z_ms2 = (acc[2] / sensib) * 9.806;
    var v_pura = z_ms2 - g_calibrado;

    // Filtro de Banda Morta
    if (Math.abs(v_pura) < ruido) v_pura = 0;

    vibracoes.push(v_pura);
  }


  // --- LEITURA DO DHT11 (a cada 1000ms) ---
  function lerDHT() {
    if (!pronto || !sistemaAtivo) return;

    var temp = dht.readTemperature();

    if (!isNaN(temp)) {
      temperaturas.push(temp);
    } else {
      console.log("Erro na leitura do DHT11");
    }
  }


  // --- ENVIO PARA A API (HTTPS) ---
  function enviarParaAPI(vibracao, temperatura, status) {
    var dados = {
      vibracao_rms: vibracao,
      temperatura:  temperatura,
      status:       status,
      timestamp:    Date.now()
    };

    // ✅ Usa "https" para porta 443 e host SEM protocolo
    var req = require("https").request({
      host:   API_HOST,
      port:   API_PORT,
      path:   API_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY":    API_KEY
      }
    }, function(res) {
      console.log("Dados enviados (Status: " + res.statusCode + ")");
      res.on('data', function(data) {
        console.log("  Resposta: " + data);
      });
    });

    req.on('error', function(err) {
      console.log("Erro ao enviar para API: " + err);
    });

    req.end(JSON.stringify(dados));
  }


  // --- CONSOLIDAÇÃO E ENVIO (a cada 5 segundos) ---
  function calcularMedias() {
    // Sistema desligado: exibe aviso, envia inativo e não faz mais nada
    if (!sistemaAtivo) {
      console.log("---------------------------------------");
      console.log("         SENSOR DESLIGADO              ");
      console.log("---------------------------------------");
      enviarParaAPI(0, 0, "inativo");
      return;
    }

    // Se não há dados ainda, aguarda
    if (vibracoes.length === 0 && temperaturas.length === 0) return;

    // Vibração RMS
    var v_rms = 0;
    if (vibracoes.length > 0) {
      var soma_q = vibracoes.reduce(function(acc, val) { return acc + (val * val); }, 0);
      var a_rms  = Math.sqrt(soma_q / vibracoes.length);
      v_rms      = a_rms * 10; // Converte para mm/s
      if (v_rms < 0.1) v_rms = 0;
    }

    // Temperatura média
    var t_media = 0;
    if (temperaturas.length > 0) {
      var soma_temp = temperaturas.reduce(function(acc, val) { return acc + val; }, 0);
      t_media       = soma_temp / temperaturas.length;
    }

    // Exibição
    console.log("---------------------------------------");
    console.log("LEITURA CONSOLIDADA (5 segundos)       ");
    console.log("Status: [ONLINE]                       ");
    console.log("---------------------------------------");
    console.log("Vibracao RMS:  " + v_rms.toFixed(2) + " mm/s");
    console.log("  (Amostras: " + vibracoes.length + ")");
    console.log("Temperatura:   " + t_media.toFixed(2) + " C");
    console.log("  (Amostras: " + temperaturas.length + ")");
    console.log("---------------------------------------");

    // Envia
    enviarParaAPI(v_rms, t_media, "online");

    // Limpa buffers para o próximo ciclo
    vibracoes    = [];
    temperaturas = [];
  }


  // --- INTERVALOS ---
  setInterval(lerMPU,        100);   // MPU6050:  a cada 100ms
  setInterval(lerDHT,       1000);   // DHT11:    a cada 1 segundo
  setInterval(calcularMedias, 5000); // Envio:    a cada 5 segundos

  console.log("\n--------- SISTEMA INICIANDO ----------");
  console.log("Botão de controle: GPIO 26");
  console.log("Sistema iniciado: DESLIGADO");
  console.log("Pressione o botão para ligar e calibrar.");
  console.log("--------------------------------------\n");
}