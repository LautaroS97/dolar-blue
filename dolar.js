const express = require('express');
const axios = require('axios');
const xmlbuilder = require('xmlbuilder');

const app = express();
app.use(express.json()); // Para manejar el cuerpo de solicitudes POST

// Variable para almacenar el XML generado
let latestXml = null;

// Función para obtener la cotización del dólar blue
async function obtenerCotizacionDolarBlue() {
    try {
        const response = await axios.get('https://dolarapi.com/v1/dolares/blue', {
            headers: { 'Content-Type': 'application/json' }
        });
        
        const { compra, venta, fechaActualizacion } = response.data;
        console.log(`Dólar Blue - Compra: ${compra}, Venta: ${venta}, Fecha de actualización: ${fechaActualizacion}`);
        
        // Generar el XML con la cotización
        const xml = xmlbuilder.create('Response')
            .ele('Say', {}, `${compra} pesos para la compra. Y ${venta} pesos para la venta.`)
            .up()
            .end({ pretty: true });

        latestXml = xml;
        console.log('XML generado:', xml);
    } catch (error) {
        console.error('Error al consultar el valor del dólar blue:', error);
        // Generar un XML de error en caso de fallo en la consulta
        latestXml = xmlbuilder.create('Response')
            .ele('Say', {}, 'Lo sentimos, no se pudo obtener la cotización del dólar blue en este momento. Intente más tarde.')
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
            .ele('Say', {}, 'Lo sentimos, no se pudo obtener la cotización del dólar blue en este momento. Intente más tarde.')
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