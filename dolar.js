const express = require('express');
const axios = require('axios');
const xmlbuilder = require('xmlbuilder');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
app.use(express.json());

let latestXml = null;

function formatearFecha(fechaString) {
    // Parsear la fecha desde el formato de la página
    const fechaRegex = /(\d{2})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}) (AM|PM)/;
    const match = fechaString.match(fechaRegex);

    if (!match) {
        throw new Error('Formato de fecha no reconocido');
    }

    let [_, dia, mes, anio, horaMinuto, amPm] = match;
    anio = `20${anio}`; // Convertir año a formato completo

    let [hora, minuto] = horaMinuto.split(':');
    if (amPm === 'PM' && hora !== '12') {
        hora = parseInt(hora, 10) + 12;
    } else if (amPm === 'AM' && hora === '12') {
        hora = '00';
    }

    const fechaISO = `${anio}-${mes}-${dia}T${hora}:${minuto}:00-03:00`;
    return new Date(fechaISO).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Argentina/Buenos_Aires'
    });
}

async function obtenerCotizacionDolarBlue() {
    try {
        const { data: html } = await axios.get('https://dolarhoy.com/');
        const $ = cheerio.load(html);

        // Seleccionar los elementos específicos para compra, venta y fecha
        const compra = $('.tile.is-child .compra .val').first().text().trim().replace('$', '');
        const venta = $('.tile.is-child .venta .val').first().text().trim().replace('$', '');
        const fechaActualizacion = $('.tile.is-child .update span').first().text().trim().replace('Actualizado por última vez: ', '');

        console.log(`Compra: ${compra}, Venta: ${venta}, Fecha de actualización: ${fechaActualizacion}`);

        if (!fechaActualizacion) {
            throw new Error('Fecha de actualización no encontrada o inválida.');
        }

        const fechaFormateada = formatearFecha(fechaActualizacion);

        // Generar el XML
        const xml = xmlbuilder.create('Response')
            .ele('Say', {}, `${compra} pesos para la compra. Y ${venta} pesos para la venta. Actualizado el ${fechaFormateada}.`)
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
            .ele('Say', 'Lo sentimos, no se pudo obtener la cotización del dólar blue en este momento. Intente más tarde.')
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