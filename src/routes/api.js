'use strict';

// Rotas de API (JSON). Na Fase 0 sao stubs que respondem 501 (Not Implemented)
// com uma mensagem clara indicando em qual fase serao implementadas.
// O contrato (metodo + caminho) ja reflete o mapa da secao 4 do planejamento.

const express = require('express');

const router = express.Router();

function naoImplementado(fase) {
  return (req, res) => {
    res.status(501).json({
      ok: false,
      erro: 'nao_implementado',
      mensagem: `${req.method} ${req.baseUrl}${req.path} sera implementado na ${fase}.`,
    });
  };
}

// Cria aplicacao, extrai texto do curriculo, retorna token
router.post('/aplicacao', naoImplementado('Fase 1'));

// Recupera aplicacao por email + codigo
router.post('/identificacao', naoImplementado('Fase 1'));

// Inicia entrevista, retorna 1a pergunta (texto + audio)
router.post('/interview/start', naoImplementado('Fase 3'));

// Recebe audio -> STT -> proxima pergunta (texto + audio)
router.post('/interview/answer', naoImplementado('Fase 3'));

// Encerra, gera relatorio, envia e-mail
router.post('/interview/finish', naoImplementado('Fase 4'));

module.exports = router;
