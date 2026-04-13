// ==============================
// CONFIGURAÇÃO
// ==============================

// Pino analógico do LM35
var LM35_PIN = D34;

// Fator de calibração (AJUSTE DEPOIS)
var FATOR = 0.17;

// ==============================
// FUNÇÃO DE LEITURA
// ==============================

function lerTemperatura() {
  var soma = 0;

  // média de 10 leituras (reduz ruído)
  for (var i = 0; i < 10; i++) {
    soma += analogRead(LM35_PIN);
  }

  var leitura = soma / 10;

  // conversão calibrada
  var temperatura = leitura * 100 * FATOR;

  return temperatura;
}

// ==============================
// LOOP PRINCIPAL
// ==============================

setInterval(function () {
  var temp = lerTemperatura();

  console.log("Temperatura:", temp.toFixed(2), "°C");

  // alerta simples
  if (temp > 60) {
    console.log("⚠️ Temperatura alta!");
  }

}, 2000);