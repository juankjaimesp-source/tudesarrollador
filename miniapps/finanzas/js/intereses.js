// ========================
// Cruce de abonos e intereses por persona
// - Interés simple: % mensual sobre el capital pendiente
// - Prorrateo diario con mes comercial: interés diario = capital × tasa / 30
// - Abono ligado a un registro ("Registrar pago") va primero a ese registro
// - Abono general (o lo que sobre): intereses de todos los préstamos → capital de los
//   préstamos con interés, del más antiguo al más nuevo → deudas sin interés, de la más antigua
// - Si aún sobra, queda como saldo a favor y se cruza contra las deudas siguientes
// ========================
(function (global) {

    const MS_DIA = 86400000;

    function diasEntre(desdeISO, hastaISO) {
        const [a1, m1, d1] = desdeISO.split('-').map(Number);
        const [a2, m2, d2] = hastaISO.split('-').map(Number);
        return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / MS_DIA);
    }

    function cronologico(a, b) {
        return (a.fechaOriginal || '').localeCompare(b.fechaOriginal || '') || a.id - b.id;
    }

    // Devuelve:
    // { deudas: { [id]: estado de cada gasto }, prestamos: { [id]: solo los que tienen interés },
    //   interesPorPersona: { [nombre]: interés causado }, creditoPorPersona: { [nombre]: saldo a favor } }
    function calcular(transacciones, hoyISO) {
        const resultado = { deudas: {}, prestamos: {}, interesPorPersona: {}, creditoPorPersona: {} };
        const porPersona = {};
        transacciones.forEach(t => { (porPersona[t.nombre] = porPersona[t.nombre] || []).push(t); });

        Object.entries(porPersona).forEach(([nombre, movimientos]) => {
            const deudas = [];
            let credito = 0;

            const conInteres = () => deudas.filter(d => d.tasa > 0);
            const sinInteres = () => deudas.filter(d => !(d.tasa > 0));

            const causarHasta = (hasta) => conInteres().forEach(d => {
                const dias = diasEntre(d.ultimaCausacion, hasta);
                if (dias <= 0) return;
                const interes = d.capital * (d.tasa / 100) / 30 * dias;
                d.interesPendiente += interes;
                d.interesCausado += interes;
                d.ultimaCausacion = hasta;
            });

            const pagarInteres = (d, monto) => {
                const aplicado = Math.min(monto, d.interesPendiente);
                d.interesPendiente -= aplicado;
                d.interesPagado += aplicado;
                return monto - aplicado;
            };
            const pagarCapital = (d, monto) => {
                const aplicado = Math.min(monto, d.capital);
                d.capital -= aplicado;
                return monto - aplicado;
            };
            const repartir = (monto) => {
                conInteres().forEach(d => { monto = pagarInteres(d, monto); });
                conInteres().forEach(d => { monto = pagarCapital(d, monto); });
                sinInteres().forEach(d => { monto = pagarCapital(d, monto); });
                return monto;
            };

            [...movimientos].sort(cronologico).forEach(t => {
                const fecha = t.fechaOriginal || '';
                if (fecha && fecha <= hoyISO) causarHasta(fecha);

                if (t.tipo !== 'pago') {
                    const tasa = t.tasaMensual > 0 && fecha ? t.tasaMensual : 0;
                    // interesDesde: intereses ya pagados por fuera hasta esa fecha
                    const inicioInteres = t.interesDesde && t.interesDesde > fecha ? t.interesDesde : fecha;
                    const deuda = {
                        id: t.id,
                        fecha,
                        tasa,
                        capitalInicial: t.valor,
                        capital: t.valor,
                        interesPendiente: 0,
                        interesCausado: 0,
                        interesPagado: 0,
                        interesDesde: inicioInteres,
                        ultimaCausacion: inicioInteres
                    };
                    deudas.push(deuda);
                    // Saldo a favor previo se cruza contra la nueva deuda
                    if (credito > 0) credito = pagarCapital(deuda, credito);
                    return;
                }

                let monto = t.valor;
                const destino = t.pagoDeItemId && deudas.find(d => d.id === t.pagoDeItemId);
                if (destino) monto = pagarCapital(destino, pagarInteres(destino, monto));
                credito += repartir(monto);
            });

            causarHasta(hoyISO);

            resultado.interesPorPersona[nombre] = 0;
            resultado.creditoPorPersona[nombre] = credito;
            deudas.forEach(d => {
                resultado.deudas[d.id] = d;
                if (d.tasa > 0) {
                    resultado.prestamos[d.id] = d;
                    resultado.interesPorPersona[nombre] += d.interesCausado;
                }
            });
        });

        return resultado;
    }

    const api = { calcular, diasEntre };
    global.Intereses = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);
