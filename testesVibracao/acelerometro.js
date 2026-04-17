I2C1.setup({ scl: 22, sda: 21 });
let mpu = require("MPU6050").connect(I2C1);

// Variáveis de Estado
let velocidade_instantanea_metros_por_segundo = 0;
let tempo_da_ultima_leitura = getTime();
let soma_dos_quadrados_da_velocidade = 0;
let contador_de_amostras_coletadas = 0;

// Variáveis de Calibração
let media_da_gravidade_com_sensor_parado = 0;
let sensor_esta_calibrado = false;
let lista_de_amostras_para_calibracao = [];

// Configurações de Filtro
let fator_de_suavizacao_do_filtro = 0.95; 
let aceleracao_filtrada_anterior = 0;
let aceleracao_bruta_anterior = 0;

console.log("Aguarde... Calibrando o 'Zero' do sensor (mantenha-o imóvel)");

setInterval(() => {
  let leitura_eixos_acelerometro = mpu.getGravity();
  
  // 1. Cálculo da Magnitude (Vetor Resultante)
  let magnitude_aceleracao_total = Math.sqrt(
    leitura_eixos_acelerometro[0] * leitura_eixos_acelerometro[0] + 
    leitura_eixos_acelerometro[1] * leitura_eixos_acelerometro[1] + 
    leitura_eixos_acelerometro[2] * leitura_eixos_acelerometro[2]
  );

  // 2. Fase de Calibração Inicial
  if (!sensor_esta_calibrado) {
    lista_de_amostras_para_calibracao.push(magnitude_aceleracao_total);
    if (lista_de_amostras_para_calibracao.length >= 100) {
      let soma_total = lista_de_amostras_para_calibracao.reduce((acumulado, valor) => acumulado + valor, 0);
      media_da_gravidade_com_sensor_parado = soma_total / lista_de_amostras_para_calibracao.length;
      sensor_esta_calibrado = true;
      console.log("Calibrado! Zero definido em:", media_da_gravidade_com_sensor_parado.toFixed(4), "G");
    }
    return; // Pula o resto do código até calibrar
  }

  // 3. Isolamento da Vibração (Filtro Passa-Alta)
  // Remove a gravidade constante para sobrar apenas a oscilação da máquina
  let aceleracao_somente_vibracao_g = fator_de_suavizacao_do_filtro * (aceleracao_filtrada_anterior + magnitude_aceleracao_total - aceleracao_bruta_anterior);
  
  aceleracao_bruta_anterior = magnitude_aceleracao_total;
  aceleracao_filtrada_anterior = aceleracao_somente_vibracao_g;

  // 4. Conversão para Unidades Físicas (m/s²)
  let aceleracao_em_metros_por_segundo_quadrado = aceleracao_somente_vibracao_g * 9.80665;

  // 5. Integração para Velocidade
  let tempo_atual = getTime();
  let intervalo_de_tempo = tempo_atual - tempo_da_ultima_leitura;
  tempo_da_ultima_leitura = tempo_atual;

  // O "0.85" é um freio (Leaky Integrator) para impedir que o erro suba infinito
  velocidade_instantanea_metros_por_segundo = (velocidade_instantanea_metros_por_segundo + 
    (aceleracao_em_metros_por_segundo_quadrado * intervalo_de_tempo)) * 0.85;

  // 6. Acúmulo para Cálculo do RMS (Velocidade Eficaz)
  let velocidade_em_milimetros_por_segundo = velocidade_instantanea_metros_por_segundo * 1000;
  soma_dos_quadrados_da_velocidade += (velocidade_em_milimetros_por_segundo * velocidade_em_milimetros_por_segundo);
  contador_de_amostras_coletadas++;

  // Exibe o resultado a cada 50 amostras (aprox. 500ms)
  if (contador_de_amostras_coletadas >= 50) {
    let media_dos_quadrados = soma_dos_quadrados_da_velocidade / contador_de_amostras_coletadas;
    let velocidade_rms_final = Math.sqrt(media_dos_quadrados);

    // "Portão de Ruído": Se for menor que 0.8 mm/s, consideramos como zero real
    if (velocidade_rms_final < 0.8) velocidade_rms_final = 0;

    console.log("Vibração Real (mm/s RMS):", velocidade_rms_final.toFixed(2));

    // Reseta o ciclo de média
    soma_dos_quadrados_da_velocidade = 0;
    contador_de_amostras_coletadas = 0;
  }

}, 10); // Executa a cada 10 milissegundos (100Hz)