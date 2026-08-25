"""Identidade central: quem fala com o bot é quem tem conta no LoginHUB.

POR QUE ISTO EXISTE
-------------------
O acesso era decidido por ``ALLOWED_USER_IDS``, uma lista de IDs do Telegram no
``.env``. Funciona, mas o controle fica fora do LoginHUB: quem sai da
organização mantém o bot até alguém lembrar de editar o arquivo e reiniciar o
container. O hub existe justamente para isso não depender de memória humana —
desligar a conta lá tem de desligar tudo.

Agora vale o mesmo desenho dos outros bots do ecossistema: a pessoa entra no app
pelo PC, com 2FA, e de lá emite um passe de uso único; o deep link abre este bot
com o passe no ``/start``, e o bot o troca pelo vínculo ``telegram_id →
loginhub_id``.

O que atravessa o chat é só o passe — 10 minutos, uso único. Senha e código do
autenticador nunca passam por aqui: no Telegram eles ficariam no histórico, nos
servidores deles e em qualquer backup de conversa.

A regra do passe (hash guardado em vez do passe, validade, uso único com a
corrida resolvida no próprio UPDATE) mora no BACKEND, que é o dono do schema.
Reimplementá-la aqui daria duas cópias de uma verificação sensível, livres para
divergir.
"""

from __future__ import annotations

import time
from typing import Optional

import aiohttp

from . import config

# Vínculo não muda em operação normal, então um cache curto derruba o custo a
# quase zero. TTL curto, e não infinito, para desvincular no app surtir efeito
# sem reiniciar o bot.
_TTL_SEGUNDOS = 60
_cache: dict[int, tuple[Optional[int], float]] = {}


def esquecer(telegram_id: int) -> None:
    """Descarta o vínculo em cache — usar logo após vincular."""
    _cache.pop(telegram_id, None)


async def loginhub_id(telegram_id: int) -> Optional[int]:
    """ID no hub de quem controla este Telegram, ou ``None`` se não vinculado.

    FALHA FECHADA: se o backend não responder, devolve ``None`` e o acesso é
    negado. É o oposto da escolha feita no auth-kit para revogação de sessão, e
    de propósito: lá a alternativa era derrubar todos os apps num incidente de
    rede; aqui a alternativa é liberar um bot para quem não provou identidade.
    """
    agora = time.monotonic()
    guardado = _cache.get(telegram_id)
    if guardado and guardado[1] > agora:
        return guardado[0]

    url = f"{config.BACKEND_API_URL}/bot/user-by-telegram/{telegram_id}"
    try:
        async with aiohttp.ClientSession() as sessao:
            async with sessao.get(url, headers={"x-api-key": config.BOT_SERVICE_KEY}) as r:
                if r.status == 404:
                    achado = None
                elif r.status == 200:
                    achado = int((await r.json())["loginhubId"])
                else:
                    return None  # erro do backend: nega, sem cachear
    except Exception:
        return None  # rede fora: nega, sem cachear

    _cache[telegram_id] = (achado, agora + _TTL_SEGUNDOS)
    return achado


async def consumir_passe(passe: str, telegram_id: int) -> Optional[int]:
    """Troca o passe do deep link pelo vínculo. Devolve o ``loginhub_id``."""
    url = f"{config.BACKEND_API_URL}/bot/consume-link-token"
    try:
        async with aiohttp.ClientSession() as sessao:
            async with sessao.post(
                url,
                headers={"x-api-key": config.BOT_SERVICE_KEY, "Content-Type": "application/json"},
                json={"token": passe, "telegramId": str(telegram_id)},
            ) as r:
                if r.status != 200:
                    return None
                dados = await r.json()
    except Exception:
        return None

    esquecer(telegram_id)
    return int(dados["loginhubId"])
