# LBS TTSAPP

**Contexto do Projeto:**
Este é um projeto pessoal pertencente ao perfil **moablive**. Serviço de conversão de texto e PDF em áudio (TTS), parte da suíte **LifeBusinessSuit**.

Por favor, ao interagir com esta base de código, tenha em mente que todas as alterações e configurações estão ligadas às preferências e necessidades pessoais deste perfil.

## Branch

A branch principal deste repositório é **`master`** — é para ela que o `origin/HEAD`
aponta e é nela que o trabalho é commitado. Não existe branch `main` aqui,
e nada deve ser renomeado para uniformizar com os outros apps da suíte: o
`LifeBusinessSuit` é mista de propósito, e o `.gitmodules` do superprojeto
declara `branch = master` para este submódulo.

```bash
git branch --show-current      # master
git push                       # origin/master
```

Ao terminar um trabalho aqui, reaponte o gitlink no superprojeto:

```bash
cd ../ && git add LBS_TTSAPP && git commit -m "chore(submodulos): reaponta o LBS_TTSAPP"
```
