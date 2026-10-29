// ========================
// Pagos mensuales: compromisos fijos (servicios, tarjetas, cuotas) y su pago por mes
// - compromiso: { id, nombre, referencia, diaPago, valorReferencia }
// - pago:       { id, compromisoId, periodo: 'YYYY-MM', valor, fechaPago: 'YYYY-MM-DD', comentario }
// El periodo es el mes que se paga; por defecto el mes anterior (el sueldo llega a inicio de mes)
// y el día de pago se toma como referencia en el mes siguiente al periodo.
// ========================
let compromisos = [];
let pagosMes = [];
let periodoVista = null;
let pagoCompromisoId = null;
let editandoCompromisoId = null;

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];

function cargarDatosPagos() {
    compromisos = JSON.parse(localStorage.getItem('controlCompromisos') || '[]');
    pagosMes = JSON.parse(localStorage.getItem('controlPagosMes') || '[]');
    periodoVista = periodoPorDefecto();
}

function guardarCompromisos() {
    localStorage.setItem('controlCompromisos', JSON.stringify(compromisos));
}

function guardarPagosMes() {
    localStorage.setItem('controlPagosMes', JSON.stringify(pagosMes));
}

// ========================
// Periodos
// ========================
function periodoDe(fecha) {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function periodoPorDefecto() {
    const hoy = new Date();
    return periodoDe(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
}

function moverPeriodo(periodo, meses) {
    const [a, m] = periodo.split('-').map(Number);
    return periodoDe(new Date(a, m - 1 + meses, 1));
}

function nombrePeriodo(periodo) {
    const [a, m] = periodo.split('-').map(Number);
    return `${MESES_LARGOS[m - 1]} ${a}`;
}

// Fecha límite de referencia: el día de pago en el mes siguiente al periodo
function fechaLimite(periodo, dia) {
    if (!dia) return null;
    const [a, m] = periodo.split('-').map(Number);
    const ultimoDia = new Date(a, m + 1, 0).getDate();
    return VozParser.aISO(new Date(a, m, Math.min(dia, ultimoDia)));
}

function fechaCortaLarga(iso) {
    const [, m, d] = iso.split('-').map(Number);
    return `${d} ${MESES_CORTOS[m - 1]}`;
}

function ultimoValorPagado(compromisoId) {
    const pagos = pagosMes.filter(p => p.compromisoId === compromisoId)
        .sort((a, b) => b.periodo.localeCompare(a.periodo) || b.id - a.id);
    return pagos.length ? pagos[0].valor : null;
}

// ========================
// Vista del mes
// ========================
function cambiarPeriodo(meses) {
    periodoVista = moverPeriodo(periodoVista, meses);
    cargarPagosMes();
}

function cargarPagosMes() {
    document.getElementById('periodoLabel').textContent = nombrePeriodo(periodoVista);
    const cont = document.getElementById('pagosContent');
    const hoy = hoyISO();

    if (!compromisos.length) {
        cont.innerHTML = '<div class="no-data"><strong>Sin compromisos todavía</strong>Agrega tus servicios, tarjetas y cuotas en "Mis compromisos".</div>';
        document.getElementById('pagosResumen').innerHTML = '';
        cargarListaCompromisos();
        cargarResumenAnio();
        return;
    }

    const filas = compromisos.map(c => {
        const pagos = pagosMes.filter(p => p.compromisoId === c.id && p.periodo === periodoVista);
        const limite = fechaLimite(periodoVista, c.diaPago);
        let estado = 'pendiente';
        if (pagos.length) estado = 'pagado';
        else if (limite && hoy > limite) estado = 'vencido';
        else if (limite && Intereses.diasEntre(hoy, limite) <= 5) estado = 'pronto';
        return { c, pagos, limite, estado };
    });

    const orden = { vencido: 0, pronto: 1, pendiente: 2, pagado: 3 };
    filas.sort((a, b) => orden[a.estado] - orden[b.estado]
        || (a.limite || '9999').localeCompare(b.limite || '9999')
        || a.c.nombre.localeCompare(b.c.nombre, 'es'));

    const pagados = filas.filter(f => f.estado === 'pagado').length;
    const total = pagosMes.filter(p => p.periodo === periodoVista).reduce((s, p) => s + p.valor, 0);
    const porcentaje = Math.round(pagados / filas.length * 100);
    document.getElementById('pagosResumen').innerHTML = `
        <div class="pagos-avance">
            <span><b>${pagados} de ${filas.length}</b> pagados</span>
            <span>${formatearMoneda(total)}</span>
        </div>
        <div class="pagos-barra"><span style="width:${porcentaje}%"></span></div>
    `;

    const textoEstado = {
        vencido: l => `Venció el ${fechaCortaLarga(l)}`,
        pronto: l => `Vence el ${fechaCortaLarga(l)}`,
        pendiente: l => l ? `Pagar antes del ${fechaCortaLarga(l)}` : 'Sin día de pago'
    };

    cont.innerHTML = filas.map(({ c, pagos, limite, estado }) => {
        const ref = c.referencia ? `Ref. ${escapeHtml(c.referencia)} · ` : '';
        let accion;
        if (estado === 'pagado') {
            const valor = pagos.reduce((s, p) => s + p.valor, 0);
            const ultimo = pagos[pagos.length - 1];
            accion = `
                <button class="compromiso-pagado" onclick="quitarPagoCompromiso(${ultimo.id})" aria-label="Quitar pago">
                    ${formatearMoneda(valor)}<small>pagado ${escapeHtml(fechaCortaLarga(ultimo.fechaPago))}</small>
                </button>`;
        } else {
            const sugerido = ultimoValorPagado(c.id) || c.valorReferencia;
            accion = `
                <button class="btn-pagar-compromiso" onclick="abrirPagoCompromiso(${c.id})">
                    Pagar${sugerido ? `<small>${formatearMoneda(sugerido)}</small>` : ''}
                </button>`;
        }
        const detalle = estado === 'pagado'
            ? `${ref}${pagos[pagos.length - 1].comentario ? escapeHtml(pagos[pagos.length - 1].comentario) : 'Al día'}`
            : `${ref}${textoEstado[estado](limite)}`;
        return `
            <div class="compromiso estado-${estado}">
                <span class="compromiso-marca">${estado === 'pagado' ? '✓' : ''}</span>
                <div class="compromiso-info">
                    <div class="compromiso-nombre">${escapeHtml(c.nombre)}</div>
                    <div class="compromiso-detalle">${detalle}</div>
                </div>
                ${accion}
            </div>
        `;
    }).join('');

    cargarListaCompromisos();
    cargarResumenAnio();
}

// ========================
// Registrar / quitar pagos
// ========================
function abrirPagoCompromiso(id, sugerencia = {}) {
    const c = compromisos.find(x => x.id === id);
    if (!c) return;
    pagoCompromisoId = id;

    document.getElementById('modalCompromisoTitulo').textContent = `Pagar ${c.nombre}`;
    document.getElementById('modalCompromisoRef').textContent = c.referencia ? `Referencia ${c.referencia}` : '';
    document.getElementById('compromisoPeriodo').value = sugerencia.periodo || periodoVista;
    document.getElementById('compromisoValor').value = sugerencia.valor || ultimoValorPagado(id) || c.valorReferencia || '';
    document.getElementById('compromisoFecha').value = hoyISO();
    document.getElementById('compromisoComentario').value = '';
    document.getElementById('modalCompromiso').classList.add('show');
    if (sugerencia.valor) marcar(document.getElementById('compromisoValor'), true);
}

function cerrarPagoCompromiso() {
    document.getElementById('modalCompromiso').classList.remove('show');
    limpiarMarca(document.getElementById('compromisoValor'));
    pagoCompromisoId = null;
}

function confirmarPagoCompromiso() {
    const c = compromisos.find(x => x.id === pagoCompromisoId);
    if (!c) return;
    const periodo = document.getElementById('compromisoPeriodo').value;
    const valor = parseFloat(document.getElementById('compromisoValor').value);
    const fechaPago = document.getElementById('compromisoFecha').value;
    const comentario = document.getElementById('compromisoComentario').value.trim();

    if (!periodo) { toast('Elige el mes que estás pagando', 'aviso'); return; }
    if (!valor || valor <= 0) { toast('Escribe cuánto pagaste', 'aviso'); return; }
    if (!fechaPago) { toast('Elige la fecha del pago', 'aviso'); return; }

    const yaPagado = pagosMes.some(p => p.compromisoId === c.id && p.periodo === periodo);
    if (yaPagado && !confirm(`${c.nombre} ya tiene un pago en ${nombrePeriodo(periodo)}. ¿Registrar otro pago para ese mes?`)) return;

    pagosMes.push({ id: Date.now(), compromisoId: c.id, periodo, valor, fechaPago, comentario });
    guardarPagosMes();
    cerrarPagoCompromiso();
    document.getElementById('fraseRapida').value = '';
    ajustarAlturaFrase(document.getElementById('fraseRapida'));
    periodoVista = periodo;
    cargarPagosMes();
    toast(`Pago registrado\n${c.nombre} · ${nombrePeriodo(periodo)}: ${formatearMoneda(valor)}`);
}

function quitarPagoCompromiso(pagoId) {
    const p = pagosMes.find(x => x.id === pagoId);
    const c = p && compromisos.find(x => x.id === p.compromisoId);
    if (!p) return;
    if (!confirm(`¿Quitar el pago de ${c ? c.nombre : 'este compromiso'} (${formatearMoneda(p.valor)}, ${nombrePeriodo(p.periodo)})?\n\nVolverá a quedar pendiente.`)) return;
    pagosMes = pagosMes.filter(x => x.id !== pagoId);
    guardarPagosMes();
    cargarPagosMes();
    toast('Pago quitado');
}

// ========================
// Mis compromisos (crear / editar / eliminar)
// ========================
function cargarListaCompromisos() {
    const cont = document.getElementById('listaCompromisos');
    document.getElementById('totalCompromisos').textContent = compromisos.length ? `(${compromisos.length})` : '';
    if (!compromisos.length) {
        cont.innerHTML = '';
        return;
    }
    cont.innerHTML = [...compromisos]
        .sort((a, b) => (a.diaPago || 99) - (b.diaPago || 99) || a.nombre.localeCompare(b.nombre, 'es'))
        .map(c => `
            <button class="compromiso-fila" onclick="abrirEditarCompromiso(${c.id})">
                <span>
                    <b>${escapeHtml(c.nombre)}</b>
                    <small>${c.referencia ? 'Ref. ' + escapeHtml(c.referencia) + ' · ' : ''}${c.diaPago ? 'día ' + c.diaPago : 'sin día de pago'}</small>
                </span>
                <span class="compromiso-fila-editar">Editar</span>
            </button>
        `).join('');
}

function abrirEditarCompromiso(id) {
    const c = id ? compromisos.find(x => x.id === id) : null;
    editandoCompromisoId = c ? c.id : null;
    document.getElementById('modalEditarTitulo').textContent = c ? 'Editar compromiso' : 'Nuevo compromiso';
    document.getElementById('editNombre').value = c ? c.nombre : '';
    document.getElementById('editReferencia').value = c ? c.referencia || '' : '';
    document.getElementById('editDia').value = c && c.diaPago ? c.diaPago : '';
    document.getElementById('editValor').value = c && c.valorReferencia ? c.valorReferencia : '';
    document.getElementById('btnEliminarCompromiso').hidden = !c;
    document.getElementById('modalEditarCompromiso').classList.add('show');
    if (!c) document.getElementById('editNombre').focus();
}

function cerrarEditarCompromiso() {
    document.getElementById('modalEditarCompromiso').classList.remove('show');
    editandoCompromisoId = null;
}

function guardarCompromiso() {
    const nombre = document.getElementById('editNombre').value.trim();
    const referencia = document.getElementById('editReferencia').value.trim();
    const dia = parseInt(document.getElementById('editDia').value, 10);
    const valor = parseFloat(document.getElementById('editValor').value);

    if (!nombre) { toast('Escribe el nombre del compromiso', 'aviso'); return; }
    if (dia && (dia < 1 || dia > 31)) { toast('El día de pago debe estar entre 1 y 31', 'aviso'); return; }
    const repetido = compromisos.find(c => c.nombre.toLowerCase() === nombre.toLowerCase() && c.id !== editandoCompromisoId);
    if (repetido) { toast('Ya existe un compromiso con ese nombre', 'aviso'); return; }

    const datos = {
        nombre,
        referencia,
        diaPago: dia || null,
        valorReferencia: valor > 0 ? valor : null
    };
    if (editandoCompromisoId) {
        Object.assign(compromisos.find(c => c.id === editandoCompromisoId), datos);
    } else {
        compromisos.push({ id: Date.now(), ...datos });
    }
    guardarCompromisos();
    cerrarEditarCompromiso();
    cargarPagosMes();
    toast(`Compromiso "${nombre}" guardado`);
}

function eliminarCompromiso() {
    const c = compromisos.find(x => x.id === editandoCompromisoId);
    if (!c) return;
    const pagos = pagosMes.filter(p => p.compromisoId === c.id).length;
    const aviso = pagos ? `\n\nTambién se borrarán sus ${pagos} pago(s) registrados.` : '';
    if (!confirm(`¿Eliminar "${c.nombre}"?${aviso}`)) return;
    compromisos = compromisos.filter(x => x.id !== c.id);
    pagosMes = pagosMes.filter(p => p.compromisoId !== c.id);
    guardarCompromisos();
    guardarPagosMes();
    cerrarEditarCompromiso();
    cargarPagosMes();
    toast('Compromiso eliminado');
}

// ========================
// Resumen del año (como la hoja de Excel)
// ========================
function cargarResumenAnio() {
    const anio = periodoVista.slice(0, 4);
    document.getElementById('anioResumen').textContent = anio;
    const cont = document.getElementById('resumenAnio');
    if (!compromisos.length) { cont.innerHTML = ''; return; }

    const meses = MESES_CORTOS.map((m, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);
    const cabecera = MESES_CORTOS.map(m => `<th>${m.charAt(0).toUpperCase()}</th>`).join('');
    const filas = [...compromisos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c => {
        const celdas = meses.map(per => {
            const valor = pagosMes.filter(p => p.compromisoId === c.id && p.periodo === per).reduce((s, p) => s + p.valor, 0);
            return valor
                ? `<td class="anio-pagado" title="${formatearMoneda(valor)}">✓</td>`
                : `<td class="${per === periodoVista ? 'anio-actual' : ''}">·</td>`;
        }).join('');
        return `<tr><th>${escapeHtml(c.nombre)}</th>${celdas}</tr>`;
    }).join('');
    const totales = meses.map(per => {
        const t = pagosMes.filter(p => p.periodo === per).reduce((s, p) => s + p.valor, 0);
        return `<td>${t ? Math.round(t / 1000).toLocaleString('es-CO') + 'k' : ''}</td>`;
    }).join('');

    cont.innerHTML = `
        <table class="tabla-anio">
            <thead><tr><th></th>${cabecera}</tr></thead>
            <tbody>${filas}</tbody>
            <tfoot><tr><th>Total</th>${totales}</tr></tfoot>
        </table>
    `;
}

// ========================
// Dictado: "pagué el CENS de la casa 126.937"
// ========================
// Devuelve true si la frase era el pago de un compromiso y ya se abrió para confirmar
function intentarPagoPorVoz(frases) {
    for (const frase of frases) {
        const r = VozParser.interpretarPagoCompromiso(frase, compromisos);
        if (!r) continue;
        cambiarTab('pagos');
        if (r.periodo) {
            periodoVista = r.periodo;
            cargarPagosMes();
        }
        abrirPagoCompromiso(r.compromiso.id, { valor: r.valor, periodo: r.periodo });
        return true;
    }
    return false;
}

window.cambiarPeriodo = cambiarPeriodo;
window.abrirPagoCompromiso = abrirPagoCompromiso;
window.cerrarPagoCompromiso = cerrarPagoCompromiso;
window.confirmarPagoCompromiso = confirmarPagoCompromiso;
window.quitarPagoCompromiso = quitarPagoCompromiso;
window.abrirEditarCompromiso = abrirEditarCompromiso;
window.cerrarEditarCompromiso = cerrarEditarCompromiso;
window.guardarCompromiso = guardarCompromiso;
window.eliminarCompromiso = eliminarCompromiso;
