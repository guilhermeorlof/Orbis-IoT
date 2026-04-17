I2C1.setup({scl:22, sda:21}); 
const mpu = require("MPU6050").connect(I2C1);

// --- Configurações ---
const amostras = 50;     // Amostras por ciclo de leitura
const sensib = 16384;    // Sensibilidade ±2g do MPU6050
const ruido = 0.5;       // Corte de ruído (Banda Morta) em m/s²

// --- Estado da Calibração ---
let g_calibrado = 0;     // O "Zero" real do seu sensor (em m/s²)
let pronto = false;      // Trava para esperar a calibração
let cal_cont = 0;        // Contador de amostras iniciais
let cal_soma = 0;        // Acumulador para média inicial

function medir() {
  // 1. CALIBRAÇÃO: Descobre a gravidade real com o sensor parado
  if (!pronto) {
    let acc = mpu.getAcceleration();
    let z_ms2 = (acc[2] / sensib) * 9.806; // Converte leitura bruta para m/s²
    
    cal_soma += z_ms2;
    cal_cont++;

    if (cal_cont >= 100) {
      g_calibrado = cal_soma / 100; // Média de 100 leituras parado
      pronto = true;
      console.log("Calibrado! Zero em: " + g_calibrado.toFixed(4));
    }
    return; // Não mede enquanto não terminar de calibrar
  }

  // 2. LEITURA: Coleta dados de vibração pura
  let v_lista = [];

  for (let i = 0; i < amostras; i++) {
    let acc = mpu.getAcceleration();
    let z_ms2 = (acc[2] / sensib) * 9.806;
    
    // Subtrai o valor calibrado para sobrar apenas o movimento da máquina
    let v_pura = z_ms2 - g_calibrado; 

    // Filtro de Banda Morta: Ignora trepidações eletrônicas insignificantes
    if (Math.abs(v_pura) < ruido) v_pura = 0;
    
    v_lista.push(v_pura);
  }

  // 3. MATEMÁTICA: Cálculo do valor RMS (Média Quadrática)
  let soma_q = v_lista.reduce((acc, val) => acc + (val * val), 0);
  let a_rms = Math.sqrt(soma_q / amostras); // Aceleração eficaz
  
  // Conversão para mm/s (Velocidade de Vibração)
  let v_rms = a_rms * 10; 

  // Limpeza final para o console não ficar "sujo" com valores minúsculos
  if (v_rms < 0.1) v_rms = 0;

  console.log("Vibração: " + v_rms.toFixed(2) + " mm/s RMS");
}

// Executa a cada 100ms
setInterval(medir, 100);