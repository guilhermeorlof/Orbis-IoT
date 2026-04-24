// ==============================
// MANUTENÇÃO PREDITIVA - ESP-32
// MPU6050 (Acelerômetro) + DHT11 (Temperatura)
// ==============================

// --- INICIALIZAÇÃO DOS SENSORES ---
I2C1.setup({scl:22, sda:21}); 
const mpu = require("MPU6050").connect(I2C1);

const DHT_PIN = 32;
let dht = require("dht11certo.js").connect(DHT_PIN);

// --- CONFIGURAÇÕES DO MPU6050 ---
const amostras = 50;     // Amostras por ciclo de leitura
const sensib = 16384;    // Sensibilidade ±2g do MPU6050
const ruido = 0.5;       // Corte de ruído (Banda Morta) em m/s²

// --- ESTADO DA CALIBRAÇÃO ---
let g_calibrado = 0;     // O "Zero" real do seu sensor (em m/s²)
let pronto = false;      // Trava para esperar a calibração
let cal_cont = 0;        // Contador de amostras iniciais
let cal_soma = 0;        // Acumulador para média inicial

// --- ARRAYS PARA ARMAZENAR LEITURAS (5 segundos) ---
let vibracoes = [];      // Leituras de vibração (MPU6050)
let temperaturas = [];   // Leituras de temperatura (DHT11)

// --- FUNÇÃO DE CALIBRAÇÃO DO MPU6050 ---
function calibrarMPU() {
  if (!pronto) {
    let acc = mpu.getAcceleration();
    let z_ms2 = (acc[2] / sensib) * 9.806; // Converte para m/s²
    
    cal_soma += z_ms2;
    cal_cont++;

    if (cal_cont >= 100) {
      g_calibrado = cal_soma / 100; // Média de 100 leituras
      pronto = true;
      console.log("\nCALIBRAÇÃO CONCLUÍDA!");
      console.log("Zero gravidade: " + g_calibrado.toFixed(4) + " m/s²\n");
    }
  }
}

// --- FUNÇÃO DE LEITURA DO MPU6050 (a cada 100ms) ---
function lerMPU() {
  // Enquanto não calibrado, calibra
  if (!pronto) {
    calibrarMPU();
    return;
  }

  let acc = mpu.getAcceleration();
  let z_ms2 = (acc[2] / sensib) * 9.806;
  
  // Subtrai valor calibrado para obter apenas vibração
  let v_pura = z_ms2 - g_calibrado; 

  // Filtro de Banda Morta
  if (Math.abs(v_pura) < ruido) v_pura = 0;
  
  // Armazena a leitura
  vibracoes.push(v_pura);
}

// --- FUNÇÃO DE LEITURA DO DHT11 (a cada 1000ms) ---
function lerDHT() {
  // Só lê depois que MPU está calibrado
  if (!pronto) return;
  
  let temp = dht.readTemperature();

  if (!isNaN(temp)) {
    temperaturas.push(temp);
  } else {
    console.log("Erro na leitura do DHT11");
  }
}

// --- FUNÇÃO PARA CALCULAR MÉDIA (a cada 5 segundos) ---
function calcularMedias() {
  // Só processa se houver dados
  if (vibracoes.length === 0 && temperaturas.length === 0) {
    return;
  }

  // Cálculo da vibração RMS (como no código original)
  let v_rms = 0;
  if (vibracoes.length > 0) {
    let soma_q = vibracoes.reduce((acc, val) => acc + (val * val), 0);
    let a_rms = Math.sqrt(soma_q / vibracoes.length);
    v_rms = a_rms * 10; // Conversão para mm/s
    
    // Limpeza de valores muito pequenos
    if (v_rms < 0.1) v_rms = 0;
  }

  // Cálculo da temperatura média
  let t_media = 0;
  if (temperaturas.length > 0) {
    let soma_temp = temperaturas.reduce((acc, val) => acc + val, 0);
    t_media = soma_temp / temperaturas.length;
  }

  // --- EXIBIÇÃO DOS RESULTADOS ---
  console.log("---------------------------------------");
  console.log("LEITURA CONSOLIDADA (5 segundos)");
  console.log("---------------------------------------");
  console.log("Vibração RMS:    " + v_rms.toFixed(2) + " mm/s");
  console.log("   (Amostras: " + vibracoes.length + ")");
  console.log("");
  console.log("Temperatura:     " + t_media.toFixed(2) + " C");
  console.log("   (Amostras: " + temperaturas.length + ")");
  console.log("---------------------------------------\n");

  // --- LIMPA OS ARRAYS PARA O PRÓXIMO CICLO ---
  vibracoes = [];
  temperaturas = [];
}

// --- CONFIGURAÇÃO DOS INTERVALOS ---
// Leitura do MPU6050 a cada 100ms
setInterval(lerMPU, 100);

// Leitura do DHT11 a cada 1000ms (1 segundo)
setInterval(lerDHT, 1000);

// Cálculo e exibição das médias a cada 5000ms (5 segundos)
setInterval(calcularMedias, 5000);

console.log("\nSistema iniciando...");
console.log("Aguarde calibração do MPU6050...\n");