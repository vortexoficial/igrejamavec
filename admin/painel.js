/* Painel Mavec: edita o dados.json da página (carrossel, conteúdo e redes). */
(() => {
  'use strict';

  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? (new URLSearchParams(location.search).get('api') || 'http://localhost:8797')
    : 'https://mavec-painel.indesignleandro.workers.dev';
  const CHAVE_TOKEN = 'mavec-painel-token';

  // Tamanho de cada tipo de imagem (o painel mostra em cada cartão e confere a proporção ao enviar)
  const TAMANHOS = {
    carrossel: { w: 1920, h: 900, max: 1920, rotulo: '1920 x 900 px', corta: true },
    banner: { w: 1017, h: 453, max: 1600, rotulo: '1017 x 453 px', corta: false },
    texto: { w: 1200, h: 800, max: 1400, rotulo: '1200 x 800 px', corta: false },
  };
  const TIPOS = {
    banner: { nome: 'Banner', icone: 'image' },
    video: { nome: 'Vídeo', icone: 'youtube' },
    texto: { nome: 'Foto + texto', icone: 'file-text' },
  };

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
  let saidaPedida = 0;
  $('#btnSair').addEventListener('click', () => {
    if (temMudanca() && Date.now() - saidaPedida > 4000){
      saidaPedida = Date.now();
      aviso('Há alterações não publicadas. Toque em Sair de novo para sair sem publicar.', true);
      return;
    }
    sair();
  });

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
      carrossel: (Array.isArray(d.carrossel) ? d.carrossel : []).map((i) => ({ ...i, tipo: 'banner' })),
      banners: (Array.isArray(d.banners) ? d.banners : []).map((i) => ({ ...i, tipo: TIPOS[i.tipo] ? i.tipo : 'banner' })),
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
  const caixa = (lista) => (lista === 'carrossel' ? $('#listaCarrossel') : $('#listaBanners'));

  function render(){
    renderLista('carrossel');
    renderLista('banners');
    $('#instagram').value = dados.instagram;
    $('#whatsapp').value = whatsParaTexto(dados.whatsapp);
    dicaRede('instagram'); dicaRede('whatsapp');
    icones();
    atualizarBarra();
  }

  function srcImagem(caminho){ return previas[caminho] || '../' + caminho; }
  function tamanhoDe(lista, item){ return lista === 'carrossel' ? TAMANHOS.carrossel : TAMANHOS[item.tipo]; }

  function renderLista(lista, novoIndice = -1){
    const box = caixa(lista);
    const itens = dados[lista];
    box.innerHTML = '';
    if (!itens.length){
      box.innerHTML = '<div class="cartao vazio">Nada aqui ainda. Use os botões abaixo para adicionar.</div>';
      return;
    }
    itens.forEach((item, i) => box.appendChild(montarCartao(lista, item, i, i === novoIndice)));
    icones();
  }

  function h(tag, attrs = {}, filhos = []){
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)){
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    (Array.isArray(filhos) ? filhos : [filhos]).forEach((f) => f && el.appendChild(f));
    return el;
  }

  function campo(rotulo, input, dica){
    return h('label', { class: 'campo' }, [h('span', { text: rotulo }), input, dica]);
  }

  function montarCartao(lista, item, i, novo){
    const itens = dados[lista];
    const tipo = item.tipo || 'banner';
    const el = h('article', { class: 'cartao item tipo-' + tipo + (novo ? ' novo' : '') + (item.ativo === false ? ' oculto' : '') });

    /* --- área de prévia --- */
    const previa = h('div', { class: 'item-imagem' });
    const cab = h('div', { class: 'item-cab' }, [
      h('span', { class: 'item-tipo', html: `<i data-lucide="${TIPOS[tipo].icone}"></i>${lista === 'carrossel' ? 'Carrossel' : TIPOS[tipo].nome}` }),
      h('span', { class: 'selo-oculto', html: '<i data-lucide="eye-off"></i>Oculto' }),
    ]);
    previa.appendChild(cab);

    if (tipo === 'video'){
      const id = idYoutube(item.video);
      previa.appendChild(id
        ? h('div', { class: 'video-previa' }, [h('img', { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: '' }), h('span', { class: 'video-play', html: '<i data-lucide="play"></i>' })])
        : h('div', { class: 'previa-vazia', html: '<i data-lucide="youtube"></i><span>Cole abaixo o link do vídeo</span>' }));
    } else if (item.imagem){
      previa.appendChild(h('img', { src: srcImagem(item.imagem), alt: item.titulo || '' }));
    } else {
      previa.appendChild(h('div', { class: 'previa-vazia', html: '<i data-lucide="image"></i><span>Sem foto (opcional)</span>' }));
    }

    if (tipo !== 'video'){
      const tam = tamanhoDe(lista, item);
      const acoesImg = h('div', { class: 'item-img-acoes' });
      const trocar = h('button', { type: 'button', class: 'btn-trocar', html: `<i data-lucide="image-up"></i>${item.imagem ? 'Trocar imagem' : 'Adicionar foto'}` });
      trocar.addEventListener('click', () => escolherImagem(lista, i, tipo));
      acoesImg.appendChild(h('span', { class: 'item-tamanho', html: `<i data-lucide="ruler"></i>Tamanho: <b>${tam.rotulo}</b>` }));
      acoesImg.appendChild(trocar);
      if (tipo === 'texto' && item.imagem){
        const tirar = h('button', { type: 'button', class: 'btn-trocar', html: '<i data-lucide="image-off"></i>Tirar' });
        tirar.addEventListener('click', () => { item.imagem = ''; renderLista(lista); atualizarBarra(); });
        acoesImg.appendChild(tirar);
      }
      previa.appendChild(acoesImg);
    }
    el.appendChild(previa);

    /* --- campos --- */
    const corpo = h('div', { class: 'item-corpo' });
    const ligar = (input, chave, depois) => input.addEventListener('input', () => { item[chave] = input.value; depois && depois(); atualizarBarra(); });

    if (tipo === 'video'){
      const fTitulo = h('input', { type: 'text', maxlength: '80', placeholder: 'Ex.: Culto de domingo (opcional)' });
      fTitulo.value = item.titulo || '';
      ligar(fTitulo, 'titulo');
      const fVideo = h('input', { type: 'url', placeholder: 'https://youtube.com/watch?v=...', autocapitalize: 'none', spellcheck: 'false', inputmode: 'url' });
      fVideo.value = item.video || '';
      const dica = h('small', { class: 'dica' });
      const mostrar = () => {
        const id = idYoutube(fVideo.value);
        dica.className = 'dica ' + (fVideo.value && !id ? 'ruim' : id ? 'ok' : '');
        dica.textContent = !fVideo.value ? 'Abra o vídeo no YouTube, toque em Compartilhar, copie o link e cole aqui.' : id ? 'Vídeo encontrado.' : 'Esse link não é de um vídeo. Copie o link do vídeo (não do canal).';
      };
      mostrar();
      fVideo.addEventListener('input', () => { item.video = fVideo.value.trim(); mostrar(); atualizarBarra(); });
      fVideo.addEventListener('change', () => renderLista(lista));
      corpo.append(campo('Título acima do vídeo', fTitulo), campo('Link do vídeo no YouTube', fVideo, dica));
    } else if (tipo === 'texto'){
      const fTitulo = h('input', { type: 'text', maxlength: '120', placeholder: 'Ex.: Encontro de casais' });
      fTitulo.value = item.titulo || '';
      ligar(fTitulo, 'titulo');
      const fTexto = h('textarea', { rows: '4', maxlength: '1500', placeholder: 'Escreva o texto do bloco' });
      fTexto.value = item.texto || '';
      ligar(fTexto, 'texto');
      const seg = h('div', { class: 'segmento', role: 'radiogroup' });
      [['acima', 'Foto em cima'], ['lado', 'Foto ao lado']].forEach(([v, r]) => {
        const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String((item.layout || 'acima') === v), text: r });
        b.addEventListener('click', () => { item.layout = v; $$('button', seg).forEach((x) => x.setAttribute('aria-checked', String(x === b))); atualizarBarra(); });
        seg.appendChild(b);
      });
      const fBotao = h('input', { type: 'text', maxlength: '40', placeholder: 'Ex.: Quero participar (opcional)' });
      fBotao.value = item.botao || '';
      ligar(fBotao, 'botao');
      const [fLink, dicaLink] = campoLink(item);
      corpo.append(
        campo('Título', fTitulo),
        campo('Texto', fTexto),
        h('div', { class: 'campo' }, [h('span', { text: 'Posição da foto (no computador)' }), seg]),
        h('div', { class: 'grade-2' }, [campo('Texto do botão', fBotao), campo('Link do botão', fLink, dicaLink)]),
      );
    } else {
      const fTitulo = h('input', { type: 'text', maxlength: '80', placeholder: 'Ex.: Culto ao vivo' });
      fTitulo.value = item.titulo || '';
      ligar(fTitulo, 'titulo');
      const [fLink, dicaLink] = campoLink(item);
      corpo.append(campo('Nome', fTitulo), campo('Link ao tocar', fLink, dicaLink));
    }

    /* --- ações --- */
    const chave = h('button', { type: 'button', class: 'chave', role: 'switch', 'aria-checked': String(item.ativo !== false), html: `<span class="chave-bola"></span><span class="chave-txt">${item.ativo !== false ? 'Visível' : 'Oculto'}</span>` });
    chave.addEventListener('click', () => {
      item.ativo = item.ativo === false;
      chave.setAttribute('aria-checked', String(item.ativo));
      $('.chave-txt', chave).textContent = item.ativo ? 'Visível' : 'Oculto';
      el.classList.toggle('oculto', !item.ativo);
      atualizarBarra();
    });
    const subir = h('button', { type: 'button', class: 'btn-icone b-subir', 'aria-label': 'Subir', html: '<i data-lucide="arrow-up"></i>' });
    const descer = h('button', { type: 'button', class: 'btn-icone b-descer', 'aria-label': 'Descer', html: '<i data-lucide="arrow-down"></i>' });
    const excluir = h('button', { type: 'button', class: 'btn-icone b-excluir', 'aria-label': 'Excluir', html: '<i data-lucide="trash-2"></i>' });
    if (i === 0) subir.disabled = true;
    if (i === itens.length - 1) descer.disabled = true;
    subir.addEventListener('click', () => mover(lista, i, -1));
    descer.addEventListener('click', () => mover(lista, i, 1));
    let armado = 0;
    excluir.addEventListener('click', () => {
      if (Date.now() - armado < 3500){
        itens.splice(i, 1);
        renderLista(lista); atualizarBarra();
        aviso('Removido. Publique para valer na página.');
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
    corpo.appendChild(h('div', { class: 'item-acoes' }, [chave, h('div', { class: 'item-ordem' }, [subir, descer, excluir])]));
    el.appendChild(corpo);
    return el;
  }

  function campoLink(item){
    const fLink = h('input', { type: 'url', placeholder: 'https://...', autocapitalize: 'none', spellcheck: 'false', inputmode: 'url' });
    fLink.value = item.link || '';
    const dica = h('small', { class: 'dica' });
    mostrarDicaLink(fLink.value, dica, item.tipo === 'texto');
    fLink.addEventListener('input', () => { item.link = fLink.value.trim(); mostrarDicaLink(fLink.value, dica, item.tipo === 'texto'); atualizarBarra(); });
    fLink.addEventListener('blur', () => {
      const n = normalizarLink(fLink.value);
      fLink.value = n; item.link = n; mostrarDicaLink(n, dica, item.tipo === 'texto'); atualizarBarra();
    });
    return [fLink, dica];
  }

  function mover(lista, i, passo){
    const itens = dados[lista];
    const j = i + passo;
    if (j < 0 || j >= itens.length) return;
    [itens[i], itens[j]] = [itens[j], itens[i]];
    renderLista(lista); atualizarBarra();
  }

  /* ---------------- Adicionar ---------------- */
  $$('[data-adicionar]').forEach((b) => b.addEventListener('click', () => {
    const lista = b.dataset.adicionar, tipo = b.dataset.tipo;
    if (tipo === 'video' || tipo === 'texto'){
      dados[lista].push(tipo === 'video' ? { tipo, titulo: '', video: '', ativo: true } : { tipo, titulo: '', texto: '', imagem: '', layout: 'acima', botao: '', link: '', ativo: true });
      renderLista(lista, dados[lista].length - 1); atualizarBarra();
      const box = caixa(lista);
      setTimeout(() => {
        box.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const primeiro = $(tipo === 'video' ? 'input[type="url"]' : 'input', box.lastElementChild);
        primeiro && primeiro.focus({ preventScroll: true });
      }, 60);
      return;
    }
    escolherImagem(lista, -1, 'banner');
  }));

  /* ---------------- Imagens ---------------- */
  let escolha = null;
  function escolherImagem(lista, indice, tipo){
    escolha = { lista, indice, tipo };
    const inp = $('#arquivo');
    inp.value = '';
    inp.click();
  }

  $('#arquivo').addEventListener('change', async (e) => {
    const arq = e.target.files && e.target.files[0];
    if (!arq || !escolha) return;
    const { lista, indice, tipo } = escolha;
    const tam = lista === 'carrossel' ? TAMANHOS.carrossel : TAMANHOS[tipo];
    try {
      aviso('Preparando a imagem...');
      const { dataUrl, w, h: alt } = await converterImagem(arq, tam.max);
      const caminho = `img/painel/${lista === 'carrossel' ? 'carrossel' : tipo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.webp`;
      novasImagens[caminho] = dataUrl;
      previas[caminho] = dataUrl;
      const itens = dados[lista];
      if (indice === -1){
        const nome = arq.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 60);
        itens.push({ tipo: 'banner', titulo: nome, imagem: caminho, link: '', ativo: true });
      } else {
        itens[indice].imagem = caminho;
      }
      renderLista(lista, indice === -1 ? itens.length - 1 : indice);
      atualizarBarra();
      const diferenca = Math.abs(w / alt - tam.w / tam.h) / (tam.w / tam.h);
      if (diferenca > 0.08){
        aviso(tam.corta
          ? `Essa imagem tem ${w} x ${alt} px. O ideal é ${tam.rotulo}: as bordas vão ser cortadas na página.`
          : `Essa imagem tem ${w} x ${alt} px. O ideal é ${tam.rotulo} para ficar igual aos outros.`, true);
      } else {
        aviso('Imagem pronta. Toque em Publicar para colocar na página.');
      }
      if (indice === -1){ const box = caixa(lista); setTimeout(() => box.lastElementChild && box.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); }
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
        const w = Math.round(img.naturalWidth * escala), hh = Math.round(img.naturalHeight * escala);
        const c = document.createElement('canvas');
        c.width = w; c.height = hh;
        c.getContext('2d').drawImage(img, 0, 0, w, hh);
        let q = 0.88, out = c.toDataURL('image/webp', q);
        if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', q); // navegador sem WebP
        while (out.length * 0.75 > 2.6 * 1024 * 1024 && q > 0.5){ q -= 0.1; out = c.toDataURL('image/webp', q); }
        ok({ dataUrl: out, w: img.naturalWidth, h: img.naturalHeight });
      };
      img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não foi possível abrir essa imagem.')); };
      img.src = url;
    });
  }

  /* ---------------- Links ---------------- */
  function idYoutube(u){
    const m = String(u || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : '';
  }
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
  function mostrarDicaLink(v, el, botao){
    v = String(v || '').trim();
    el.className = 'dica';
    if (!v){ el.textContent = botao ? 'Sem link, o botão não aparece.' : 'Sem link: o banner aparece, mas não abre nada.'; return; }
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

  function problema(){
    for (const [lista, itens] of [['carrossel', dados.carrossel], ['banners', dados.banners]]){
      for (const it of itens){
        const nome = it.titulo || TIPOS[it.tipo].nome.toLowerCase();
        if (it.link && !/^(https?:\/\/|mailto:|tel:)/i.test(normalizarLink(it.link))) return [lista, `O link de "${nome}" está incompleto.`];
        if (it.tipo === 'video' && !idYoutube(it.video)) return [lista, 'Um vídeo está sem link do YouTube válido.'];
        if (it.tipo === 'texto' && !it.titulo && !it.texto && !it.imagem) return [lista, 'Um bloco de foto + texto está vazio.'];
      }
    }
    for (const r of ['instagram', 'whatsapp']){
      if (dados[r] && !/^https?:\/\//.test(dados[r])) return ['redes', 'Confira o ' + (r === 'instagram' ? 'Instagram' : 'WhatsApp') + '.'];
    }
    return null;
  }

  $('#btnPublicar').addEventListener('click', async () => {
    const p = problema();
    if (p){ trocarAba(p[0]); aviso(p[1], true); return; }
    const todos = [...dados.carrossel, ...dados.banners];
    todos.forEach((i) => { if (i.link) i.link = normalizarLink(i.link); });

    const usadas = new Set(todos.map((i) => i.imagem).filter(Boolean));
    const imagens = Object.entries(novasImagens).filter(([c]) => usadas.has(c)).map(([caminho, base64]) => ({ caminho, base64 }));
    const btn = $('#btnPublicar');
    btn.disabled = true;
    btn.innerHTML = '<span class="giro"></span><span>Publicando</span>';
    try {
      const r = await api('/api/publicar', { method: 'POST', body: JSON.stringify({ dados, imagens, versao }) });
      original = JSON.stringify(dados); // as prévias continuam em memória até a página atualizar
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
    tAviso = setTimeout(() => el.classList.remove('ver'), ruim ? 6000 : 3200);
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------------- Início ---------------- */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  token ? abrirApp() : mostrarEntrar();
})();
