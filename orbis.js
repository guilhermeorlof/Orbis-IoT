// ==============================
// WIFI
// ==============================

var wifi = require("WiFi");

wifi.connect("SEU_WIFI", { password: "SUA_SENHA" }, function(err) {
  if (err) {
    console.log("Erro ao conectar WiFi:", err);
  } else {
    console.log("WiFi conectado!");
    console.log("IP:", wifi.getIP());
  }
});

// ==============================
// SENSOR DHT11
// ==============================

const DHT_PIN = 32;
let dht = require("dht11certo.js").connect(DHT_PIN);

// ==============================
// CONFIG API
// ==============================

const HOST = "192.168.0.100"; // ALTERAR
const PORT = 3000;            // ALTERAR
const PATH = "/api/dados";    // ALTERAR

// ==============================
// FUNÇÃO DE ENVIO
// ==============================

function enviarParaAPI(temp) {

  let dados = {
    temperatura: temp,
    timestamp: Date.now()
  };

  let req = require("http").request({
    host: HOST,
    port: PORT,
    path: PATH,
    method: "POST",
    headers: {
      "Content-Type": "application/json", 
      "X-API-KEY": "SUA_CHAVE_AQUI"
    },
    body: JSON.stringify(dados)
  }, function (res) {
    res.on('data', function (data) {
      console.log("Resposta API:", data);
    });
  });

  req.on('error', function (err) {
    console.log("Erro ao enviar:", err);
  });

  req.end(JSON.stringify(dados));
}


const response = await fetch("https://oribis-5hnm.onrender.com/sensores",{
  headers: {
    "Content-Type": "application/json",
    "X-API-KEY": "SUA_CHAVE_AQUI"
  },
  body: JSON.stringify({  })
})

// ==============================
// LEITURA + ENVIO
// ==============================

function lerTemperatura() {

  let temp = dht.readTemperature();

  if (!temp) {//
    console.log("Erro na leitura do sensor");
    return;
  }

  console.log("Temperatura:", temp.toFixed(1), "°C");

  enviarParaAPI(temp);
}

// ==============================
// LOOP
// ==============================

setInterval(function () {

  // só envia se estiver conectado
  if (wifi.getIP()) {
    lerTemperatura();
  } else {
    console.log("Sem WiFi...");
  }

}, 5000); // a cada 5 segundos