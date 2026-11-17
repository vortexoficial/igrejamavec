/* Painel Mavec: edita o dados.json da página (carrossel, banners e redes). */
(() => {
  'use strict';

  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? (new URLSearchParams(location.search).get('api') || 'http://localhost:8797')
    : 'https://mavec-painel.indesignleandro.workers.dev';
  const CHAVE_TOKEN = 'mavec-painel-token';
  const LARGURA_MAX = { carrossel: 1920, banners: 1600 };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const icones = () => window.lucide && window.lucide.createIcons();

  const guardar = {
    ler(){ try { return localStorage.getItem(CHAVE_TOKEN) || ''; } catch { return ''; } },
    gravar(v){ try { v ? localStorage.setItem(CHAVE_TOKEN, v) : localStorage.removeItem(CHAVE_TOKEN); } catch {} },
  };

  let token = guardar.ler();
  let dados = null;        // estado atual (editado)
  let original = '';       // JSON do que está publicado
  let versao = '';         // sha do dados.json publicado
  let novasImagens = {};   // caminho -> dataURL (ainda não publicadas)
  const previas = {};      // caminho -> dataURL (para mostrar enquanto a página atualiza)
  let abaAtual = 'carrossel';

  /* ---------------- API ---------------- */
  async function api(caminho, opcoes = {}){
    const r = await fetch(API + caminho, {
      ...opcoes,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    });
    const corpo = await r.json().catch(() => ({}));
    if (r.status === 401 && caminho !== '/api/login'){ sair(); throw new Error(corpo.erro || 'Entre de novo.'); }
    if (!r.ok) throw new Error(corpo.erro || 'Não foi possível concluir. Confira a internet e tente de novo.');
    return corpo;
  }

  /* ---------------- Entrar / sair ---------------- */
  function mostrarEntrar(){
    $('#telaApp').hidden = true;
    $('#telaEntrar').hidden = false;
    icones();
    setTimeout(() => $('#usuario').focus(), 50);
  }

  $('#verSenha').addEventListener('click', () => {
    const i = $('#senha');
    const ver = i.type === 'password';
    i.type = ver ? 'text' : 'password';
    $('#verSenha').setAttribute('aria-label', ver ? 'Esconder senha' : 'Mostrar senha');
    $('#verSenha').innerHTML = `<i data-lucide="${ver ? 'eye-off' : 'eye'}"></i>`;
    icones();
  });

  $('#formEntrar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#btnEntrar');
    $('#erroEntrar').textContent = '';
    btn.disabled = true;
    try {
      const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ usuario: $('#usuario').value, senha: $('#senha').value }) });
      token = r.token;
      guardar.gravar(token);
      $('#senha').value = '';
      abrirApp();
    } catch (err){
      $('#erroEntrar').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  function sair(){
    token = '';
    guardar.gravar('');
    dados = null;
    mostrarEntrar();
  }
  $('#btnSair').addEventListener('click', () => {
    if (temMudanca() && !confirmarSaida()) return;
    sair();
  });
  let saidaPedida = 0;
  function confirmarSaida(){
    if (Date.now() - saidaPedida < 4000) return true;
    saidaPedida = Date.now();
    aviso('Há alterações não publicadas. Toque em Sair de novo para sair sem publicar.', true);
    return false;
  }

  /* ---------------- App ---------------- */
  async function abrirApp(){
    $('#telaEntrar').hidden = true;
    $('#telaApp').hidden = false;
    $('#carregando').hidden = false;
    $$('.painel').forEach((p) => (p.hidden = true));
    icones();
    try {
      const r = await api('/api/dados');
      carregar(r.dados, r.versao);
      trocarAba(abaAtual);
    } catch (err){
      if (token) $('#carregando').innerHTML = `<span>${esc(err.message)}</span>`;
    }
  }

  function carregar(d, v){
    dados = {
      carrossel: Array.isArray(d.carrossel) ? d.carrossel : [],
      banners: Array.isArray(d.banners) ? d.banners : [],
      instagram: d.instagram || '',
      whatsapp: d.whatsapp || '',
    };
    original = JSON.stringify(dados);
    versao = v;
    novasImagens = {};
    $('#carregando').hidden = true;
    render();
  }

  function trocarAba(aba){
    abaAtual = aba;
    $$('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === aba));
    $$('.painel').forEach((p) => (p.hidden = !dados || p.dataset.painel !== aba));
    window.scrollTo({ top: 0 });
  }
  $$('.aba').forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.aba)));

  /* ---------------- Render ---------------- */
  function render(){
    renderLista('carrossel', $('#listaCarrossel'));
    renderLista('banners', $('#listaBanners'));
    $('#instagram').value = dados.instagram;
    $('#whatsapp').value = whatsParaTexto(dados.whatsapp);
    dicaRede('instagram'); dicaRede('whatsapp');
    icones();
    atualizarBarra();
  }

  function srcImagem(caminho){
    return previas[caminho] || '../' + caminho;
  }

  function renderLista(tipo, box, novoIndice = -1){
    const lista = dados[tipo];
    box.innerHTML = '';
    if (!lista.length){
      box.innerHTML = '<div class="cartao vazio">Nenhum banner. Toque em adicionar para colocar o primeiro.</div>';
      return;
    }
    lista.forEach((item, i) => {
      const el = $('#modeloItem').content.firstElementChild.cloneNode(true);
      if (i === novoIndice) el.classList.add('novo');
      el.classList.toggle('oculto', item.ativo === false);
      const img = $('img', el);
      img.src = srcImagem(item.imagem);
      img.alt = item.titulo || '';

      const fTitulo = $('.f-titulo', el), fLink = $('.f-link', el), dica = $('.dica', el);
      fTitulo.value = item.titulo || '';
      fLink.value = item.link || '';
      mostrarDicaLink(fLink.value, dica);

      fTitulo.addEventListener('input', () => { item.titulo = fTitulo.value; atualizarBarra(); });
      fLink.addEventListener('input', () => { item.link = fLink.value.trim(); mostrarDicaLink(fLink.value, dica); atualizarBarra(); });
      fLink.addEventListener('blur', () => {
        const n = normalizarLink(fLink.value);
        fLink.value = n; item.link = n; mostrarDicaLink(n, dica); atualizarBarra();
      });

      const chave = $('.chave', el);
      chave.setAttribute('aria-checked', String(item.ativo !== false));
      $('.chave-txt', el).textContent = item.ativo !== false ? 'Visível' : 'Oculto';
      chave.addEventListener('click', () => {
        item.ativo = item.ativo === false;
        chave.setAttribute('aria-checked', String(item.ativo));
        $('.chave-txt', el).textContent = item.ativo ? 'Visível' : 'Oculto';
        el.classList.toggle('oculto', !item.ativo);
        atualizarBarra();
      });

      const subir = $('.b-subir', el), descer = $('.b-descer', el);
      subir.disabled = i === 0;
      descer.disabled = i === lista.length - 1;
      subir.addEventListener('click', () => mover(tipo, i, -1));
      descer.addEventListener('click', () => mover(tipo, i, 1));

      const excluir = $('.b-excluir', el);
      let armado = 0;
      excluir.addEventListener('click', () => {
        if (Date.now() - armado < 3500){
          lista.splice(i, 1);
          renderLista(tipo, box); icones(); atualizarBarra();
          aviso('Banner removido. Publique para valer na página.');
          return;
        }
        armado = Date.now();
        excluir.classList.add('confirmar');
        excluir.innerHTML = '<i data-lucide="trash-2"></i><span>Excluir?</span>';
        icones();
        setTimeout(() => {
          if (!excluir.isConnected) return;
          excluir.classList.remove('confirmar');
          excluir.innerHTML = '<i data-lucide="trash-2"></i>';
          icones();
        }, 3500);
      });

      $('.btn-trocar', el).addEventListener('click', () => escolherImagem(tipo, i));
      box.appendChild(el);
    });
  }

  function mover(tipo, i, passo){
    const lista = dados[tipo];
    const j = i + passo;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    renderLista(tipo, tipo === 'carrossel' ? $('#listaCarrossel') : $('#listaBanners'));
    icones(); atualizarBarra();
  }

  /* ---------------- Imagens ---------------- */
  let escolha = null;
  function escolherImagem(tipo, indice){
    escolha = { tipo, indice };
    const inp = $('#arquivo');
    inp.value = '';
    inp.click();
  }
  $$('[data-adicionar]').forEach((b) => b.addEventListener('click', () => escolherImagem(b.dataset.adicionar, -1)));

  $('#arquivo').addEventListener('change', async (e) => {
    const arq = e.target.files && e.target.files[0];
    if (!arq || !escolha) return;
    const { tipo, indice } = escolha;
    try {
      aviso('Preparando a imagem...');
      const dataUrl = await converterImagem(arq, LARGURA_MAX[tipo]);
      const caminho = `img/painel/${tipo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.webp`;
      novasImagens[caminho] = dataUrl;
      previas[caminho] = dataUrl;
      const lista = dados[tipo];
      if (indice === -1){
        const nome = arq.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 60);
        lista.push({ titulo: nome, imagem: caminho, link: '', ativo: true });
      } else {
        lista[indice].imagem = caminho;
      }
      const box = tipo === 'carrossel' ? $('#listaCarrossel') : $('#listaBanners');
      renderLista(tipo, box, indice === -1 ? lista.length - 1 : indice);
      icones(); atualizarBarra();
      aviso('Imagem pronta. Toque em Publicar para colocar na página.');
      if (indice === -1) setTimeout(() => box.lastElementChild && box.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    } catch (err){
      aviso(err.message || 'Não foi possível abrir essa imagem.', true);
    }
  });

  function converterImagem(arq, larguraMax){
    return new Promise((ok, falha) => {
      if (!/^image\//.test(arq.type)) return falha(new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).'));
      const url = URL.createObjectURL(arq);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const escala = Math.min(1, larguraMax / img.naturalWidth);
        const w = Math.round(img.naturalWidth * escala), h = Math.round(img.naturalHeight * escala);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        let q = 0.88, out = c.toDataURL('image/webp', q);
        if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', q); // navegador sem WebP
        while (out.length * 0.75 > 2.6 * 1024 * 1024 && q > 0.5){ q -= 0.1; out = c.toDataURL('image/webp', q); }
        ok(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não foi possível abrir essa imagem.')); };
      img.src = url;
    });
  }

  /* ---------------- Links ---------------- */
  function normalizarLink(v){
    v = String(v || '').trim();
    if (!v) return '';
    if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v;
    const so = v.replace(/\D/g, '');
    if (/^[\d\s()+\-.]+$/.test(v) && so.length >= 10) return 'https://wa.me/' + (so.length <= 11 ? '55' + so : so);
    if (/^@[\w.]+$/.test(v)) return 'https://instagram.com/' + v.slice(1);
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return 'https://' + v;
    return v;
  }
  function mostrarDicaLink(v, el){
    v = String(v || '').trim();
    el.className = 'dica';
    if (!v){ el.textContent = 'Sem link: o banner aparece, mas não abre nada.'; return; }
    const n = normalizarLink(v);
    if (/^(https?:\/\/|mailto:|tel:)/i.test(n)){ el.textContent = n === v ? '' : 'Vai abrir: ' + n; el.classList.add('ok'); }
    else { el.textContent = 'Link incompleto. Cole o endereço inteiro, começando com https://'; el.classList.add('ruim'); }
  }

  function whatsParaTexto(link){
    const m = String(link || '').match(/wa\.me\/(\d+)/);
    if (!m) return link || '';
    const n = m[1].replace(/^55(?=\d{10,11}$)/, '');
    return n.length === 11 ? `${n.slice(0, 2)} ${n.slice(2, 7)}-${n.slice(7)}` : n.length === 10 ? `${n.slice(0, 2)} ${n.slice(2, 6)}-${n.slice(6)}` : n;
  }

  function dicaRede(qual){
    const el = $(`[data-dica="${qual}"]`);
    const v = qual === 'instagram' ? dados.instagram : dados.whatsapp;
    el.className = 'dica';
    if (!v){ el.textContent = 'Vazio: o ícone continua na página, sem abrir nada.'; return; }
    if (/^https?:\/\//.test(v)){ el.textContent = 'Vai abrir: ' + v; el.classList.add('ok'); }
    else { el.textContent = qual === 'whatsapp' ? 'Digite o número com DDD.' : 'Digite o @ do perfil ou cole o link.'; el.classList.add('ruim'); }
  }

  $('#instagram').addEventListener('input', (e) => {
    let v = e.target.value.trim();
    if (v && !/^https?:\/\//i.test(v)){
      const user = v.replace(/^@/, '').replace(/^(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '');
      v = /^[\w.]+$/.test(user) ? 'https://instagram.com/' + user : v;
    }
    dados.instagram = v; dicaRede('instagram'); atualizarBarra();
  });
  $('#whatsapp').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    const so = v.replace(/\D/g, '');
    if (!v) dados.whatsapp = '';
    else if (/^https?:\/\//i.test(v)) dados.whatsapp = v;
    else if (so.length >= 10) dados.whatsapp = 'https://wa.me/' + (so.length <= 11 ? '55' + so : so);
    else dados.whatsapp = v;
    dicaRede('whatsapp'); atualizarBarra();
  });

  /* ---------------- Publicar ---------------- */
  function temMudanca(){ return !!dados && JSON.stringify(dados) !== original; }
  function atualizarBarra(){ $('#barraPublicar').hidden = !temMudanca(); icones(); }

  $('#btnDescartar').addEventListener('click', () => {
    carregar(JSON.parse(original), versao);
    aviso('Alterações desfeitas.');
  });

  $('#btnPublicar').addEventListener('click', async () => {
    const todos = [...dados.carrossel, ...dados.banners];
    const ruim = todos.find((i) => i.link && !/^(https?:\/\/|mailto:|tel:)/i.test(normalizarLink(i.link)));
    if (ruim){ aviso(`O link de "${ruim.titulo || 'um banner'}" está incompleto.`, true); return; }
    todos.forEach((i) => (i.link = normalizarLink(i.link)));
    for (const r of ['instagram', 'whatsapp']){
      if (dados[r] && !/^https?:\/\//.test(dados[r])){ trocarAba('redes'); aviso('Confira o ' + (r === 'instagram' ? 'Instagram' : 'WhatsApp') + '.', true); return; }
    }

    const usadas = new Set(todos.map((i) => i.imagem));
    const imagens = Object.entries(novasImagens).filter(([c]) => usadas.has(c)).map(([caminho, base64]) => ({ caminho, base64 }));
    const btn = $('#btnPublicar');
    btn.disabled = true;
    btn.innerHTML = '<span class="giro"></span><span>Publicando</span>';
    try {
      const r = await api('/api/publicar', { method: 'POST', body: JSON.stringify({ dados, imagens, versao }) });
      // as prévias continuam em memória até a página atualizar
      original = JSON.stringify(dados);
      versao = r.versao;
      novasImagens = {};
      render();
      aviso('Publicado. A página mostra as mudanças em até 1 minuto.');
    } catch (err){
      aviso(err.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="cloud-upload"></i><span>Publicar</span>';
      icones();
    }
  });

  window.addEventListener('beforeunload', (e) => { if (temMudanca()){ e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- Aviso ---------------- */
  let tAviso;
  function aviso(txt, ruim = false){
    const el = $('#aviso');
    el.textContent = txt;
    el.classList.toggle('ruim', ruim);
    el.classList.add('ver');
    clearTimeout(tAviso);
    tAviso = setTimeout(() => el.classList.remove('ver'), ruim ? 5000 : 3200);
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------------- Início ---------------- */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  token ? abrirApp() : mostrarEntrar();
})();
