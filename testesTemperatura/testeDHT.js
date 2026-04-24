// ==============================
// CONFIGURAÇÃO
// ==============================

// Pino do DHT11
const DHT_PIN = 32;

// Inicializa sensor
let dht = require("dht11.js").connect(DHT_PIN);

// ==============================
// FUNÇÃO DE LEITURA
// ==============================
function lerDHT() {
  let temp = dht.readTemperature();


  if (isNaN(temp)) {
    console.log("Erro na leitura do DHT11");
    return;
  }
  console.log(temp);
  return temp;
  

}

setInterval(lerDHT, 1000); // Lê a cada 2 segundos