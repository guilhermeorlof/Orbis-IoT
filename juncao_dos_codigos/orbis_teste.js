// === CONFIGURAÇÃO ===
const PIN_DHT = 32;
let dht = require("dht11.js").connect(PIN_DHT);

I2C1.setup({scl:22, sda:21}); 
const mpu = require("MPU6050").connect(I2C1);

// Configurações MPU
const amostras = 40;     // Reduzido levemente para estabilidade
const sensib = 16384;
const ruido = 0.5;

// Variáveis de Estado (Memória Fixa)
let g_cal = 0;
let pronto = false;
let c_cont = 0;
let c_soma = 0;
let temp_at = 0;
let v_rms_at = 0;

function processar() {
  // 1. LEITURA DHT (Só atualiza se o objeto existir)
  if (dht) {
    let t = dht.readTemperature();
    if (!isNaN(t)) temp_at = t;
  }

  // 2. CALIBRAÇÃO (Primeiros ciclos)
  if (!pronto) {
    let acc = mpu.getAcceleration();
    let z_ms2 = (acc[2] / sensib) * 9.806;
    c_soma += z_ms2;
    c_cont++;
    if (c_cont >= 100) {
      g_cal = c_soma / 100;
      pronto = true;
      console.log("SISTEMA OK!");
    }
    return;
  }

  // 3. MEDIÇÃO SEM USAR ARRAY (Otimização de Memória)
  let soma_quadrados = 0;
  
  for (let i = 0; i < amostras; i++) {
    let acc = mpu.getAcceleration();
    let z_ms2 = (acc[2] / sensib) * 9.806;
    let v_pura = z_ms2 - g_cal; 

    if (Math.abs(v_pura) < ruido) v_pura = 0;
    
    // Soma o quadrado diretamente para evitar criar listas na RAM
    soma_quadrados += (v_pura * v_pura);
  }

  let a_rms = Math.sqrt(soma_quadrados / amostras);
  v_rms_at = a_rms * 10;
  if (v_rms_at < 0.1) v_rms_at = 0;

  // 4. LOG UNIFICADO
  console.log("T: " + temp_at.toFixed(1) + "C | Vib: " + v_rms_at.toFixed(2) + " mm/s");
}

// Intervalo de 800ms para dar tempo ao processador de limpar a memória
setInterval(processar, 800);