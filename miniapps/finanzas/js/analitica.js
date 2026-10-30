// ========================
// Estadísticas de uso con GoatCounter (sin cookies)
// Solo se envían conteos: aperturas y eventos como "registro-gasto". Nunca nombres, valores ni registros.
// ========================
const GOATCOUNTER_CODIGO = 'tudesarrollador';

function esAppInstalada() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function analiticaActiva() {
    return !!GOATCOUNTER_CODIGO && location.protocol === 'https:' && contarEsteDispositivo();
}

// Envío directo al endpoint de GoatCounter (sin cargar count.js, que los bloqueadores suelen frenar)
function enviarConteo(path, esEvento) {
    if (!analiticaActiva()) return;
    try {
        const params = new URLSearchParams({
            p: path,
            t: esEvento ? path : 'Finanzas',
            e: esEvento ? 'true' : 'false',
            s: `${screen.width},${screen.height},${window.devicePixelRatio || 1}`,
            b: '0',
            rnd: Math.random().toString(36).slice(2)
        });
        if (!esEvento && document.referrer) params.set('r', document.referrer);
        const url = `https://${GOATCOUNTER_CODIGO}.goatcounter.com/count?${params}`;
        if (!(navigator.sendBeacon && navigator.sendBeacon(url))) new Image().src = url;
    } catch (err) {
        // Las estadísticas nunca deben interrumpir el uso de la app
    }
}

// La apertura se cuenta separando app instalada de navegador
function contarApertura() {
    enviarConteo('/miniapps/finanzas/' + (esAppInstalada() ? 'app-instalada' : 'navegador'), false);
}

function contarEsteDispositivo() {
    return localStorage.getItem('skipgc') !== 't';
}

function cambiarConteoDispositivo(contar) {
    if (contar) localStorage.removeItem('skipgc');
    else localStorage.setItem('skipgc', 't');
    toast(contar ? 'Este dispositivo se contará en las estadísticas.' : 'Este dispositivo ya no se cuenta en las estadísticas.');
}

function contarEvento(nombre) {
    enviarConteo(nombre, true);
}

document.addEventListener('DOMContentLoaded', () => {
    contarApertura();
    const casilla = document.getElementById('contarDispositivo');
    if (casilla) {
        casilla.checked = contarEsteDispositivo();
        casilla.addEventListener('change', () => cambiarConteoDispositivo(casilla.checked));
    }
    window.addEventListener('appinstalled', () => contarEvento('app-instalada'));
});
