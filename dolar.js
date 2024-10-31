const express = require('express');
const puppeteer = require('puppeteer');
const xmlbuilder = require('xmlbuilder');
require('dotenv').config(); // Para manejar variables de entorno

const app = express();
app.use(express.json()); // Para manejar el cuerpo de solicitudes POST

// Variable para almacenar el XML generado
let latestXml = null;

// Función para formatear la fecha y ajustarla automáticamente a la zona horaria de Argentina
function formatearFecha(fechaString) {
    // Convertir la cadena de texto al formato adecuado
    const [fecha, hora] = fechaString.split(" ");
    const [dia, mes, año] = fecha.split(".");
    const [hora24, minutos] = hora.split(":");
    
    const fechaFormateada = new Date(`${año}-${mes}-${dia}T${hora24}:${minutos}:00-03:00`);

    const opciones = {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Argentina/Buenos_Aires'
    };

    return new Intl.DateTimeFormat('es-ES', opciones).format(fechaFormateada);
}

// Función para obtener la cotización del dólar blue mediante scraping
async function obtenerCotizacionDolarBlue() {
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto('https://www.cronista.com/MercadosOnline/moneda.html?id=ARSB', { waitUntil: 'networkidle2' });

        // Extraer los valores de compra, venta y fecha de actualización
        const compra = await page.$eval('.buy .val', el => el.textContent.trim().replace(/\./g, '').replace(',', '.'));
        const venta = await page.$eval('.sell .val', el => el.textContent.trim().replace(/\./g, '').replace(',', '.'));
        const fechaActualizacion = await page.$eval('.date', el => el.textContent.replace('Fecha y hora actualización:', '').trim());

        // Formatear la fecha de actualización
        const fechaFormateada = formatearFecha(fechaActualizacion);
        console.log(`Fecha formateada: ${fechaFormateada}`);
        
        // Generar el XML con la cotización
        const xml = xmlbuilder.create('Response')
            .ele('Say', { voice: 'Polly.Andres-Neural', language: "es-MX" }, `${compra} pesos para la compra. Y ${venta} pesos para la venta. Actualizado el ${fechaFormateada}.`)
            .up()
            .ele('Redirect', { method: 'POST' }, `${process.env.TWILIO_WEBHOOK_URL}?FlowEvent=return`)
            .up()
            .end({ pretty: true });

        latestXml = xml;
        console.log('XML generado:', xml);
    } catch (error) {
        console.error('Error al consultar el valor del dólar blue:', error);
        // Generar un XML de error en caso de fallo en la consulta
        latestXml = xmlbuilder.create('Response')
            .ele('Say', { voice: 'Polly.Andres-Neural', language: "es-MX" }, 'Lo sentimos, no se pudo obtener la cotización del dólar blue en este momento. Intente más tarde.')
            .up()
            .ele('Redirect', { method: 'POST' }, `${process.env.TWILIO_WEBHOOK_URL}?FlowEvent=return`)
            .up()
            .end({ pretty: true });
    } finally {
        if (browser) await browser.close();
    }
}

// Manejo de la solicitud POST para actualizar el XML del dólar blue
app.post('/update', async (req, res) => {
    console.log('Solicitud POST entrante para actualizar el XML del dólar blue');
    try {
        await obtenerCotizacionDolarBlue();
        res.status(200).send({ message: 'Cotización del dólar blue actualizada correctamente.' });
    } catch (error) {
        console.error('Error al actualizar el XML del dólar blue:', error);
        res.status(500).send({ message: 'Error al actualizar la cotización.' });
    }
});

// Manejo de las solicitudes GET para obtener el XML del dólar blue
app.get('/dolar-blue', (req, res) => {
    console.log('Solicitud GET entrante a /dolar-blue');
    
    if (latestXml) {
        res.type('application/xml');
        res.send(latestXml);
    } else {
        // Si no hay XML disponible, generar un XML de error
        const xml = xmlbuilder.create('Response')
            .ele('Say', { voice: 'Polly.Andres-Neural', language: "es-MX" }, 'Lo sentimos, no se pudo obtener la cotización del dólar blue en este momento. Intente más tarde.')
            .up()
            .ele('Redirect', `${process.env.TWILIO_WEBHOOK_URL}?FlowEvent=return`)
            .up()
            .end({ pretty: true });

        res.type('application/xml');
        res.send(xml);
    }
});

const PORT = process.env.PORT || 8080;

// Iniciar el servidor y actualizar el XML al momento del deploy
app.listen(PORT, async () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
    
    // Actualizar la cotización del dólar blue inmediatamente después de iniciar el servidor
    try {
        await obtenerCotizacionDolarBlue();
        console.log('Cotización inicial del dólar blue obtenida y XML generado.');
    } catch (error) {
        console.error('Error al obtener la cotización inicial del dólar blue:', error);
    }
});