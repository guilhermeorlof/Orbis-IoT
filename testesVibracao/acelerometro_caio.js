// Configuração do I2C para o ESP32
I2C1.setup({scl:D22, sda:D21}); 

// Importa o módulo do MPU6050
const mpu = require("MPU6050").connect(I2C1);

// Variáveis para o cálculo
let leituras = [];
const numAmostras = 50; // Quantidade de amostras para o cálculo de RMS
const sensibilidade = 16384; // Sensibilidade padrão (±2g)

function lerVibracao() {
  leituras = [];
  const thresholdRuido = 1.25; // Ajuste este valor conforme necessário

  for (let i = 0; i < numAmostras; i++) {
    let acc = mpu.getAcceleration();
    let z_ms2 = (acc[2] / sensibilidade) * 9.806;
    let vibra_pura = z_ms2 - 9.806; 

    // FILTRO DE BANDA MORTA:
    // Se a vibração for menor que o ruído base, forçamos para zero
    if (Math.abs(vibra_pura) < thresholdRuido) {
      vibra_pura = 0;
    }
    
    leituras.push(vibra_pura);
  }

  let somaQuadrados = leituras.reduce((acc, val) => acc + (val * val), 0);
  let rmsAceleracao = Math.sqrt(somaQuadrados / numAmostras);
  
  // Se o RMS for muito baixo, garantimos o zero absoluto
  let vRMS_mms = rmsAceleracao > 0.05 ? rmsAceleracao * 10 : 0;

  console.log("Vibração: " + vRMS_mms.toFixed(2) + " mm/s");
}

// Executa a leitura a cada 1 segundo (ou menos para mais precisão)
setInterval(lerVibracao, 100);