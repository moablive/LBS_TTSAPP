// Áudio pronto das melhorias aplicadas no servidor (post do Instagram → 3 projetos).
// Semeia um TranslationResult direto, sem passar pelo /process: o AudioPlayer
// sintetiza cada parágrafo pelo /tts-section, na voz Francisca. É o mesmo motor
// (edge-tts) que gerou o data/melhorias-servidor.mp3 no backend.
import type { TranslationResult, SectionItem, Language } from '../types';

const VOZ = 'pt-BR-FranciscaNeural';

const PARAGRAFOS: string[] = [
  'Aqui é o resumo das melhorias que apliquei no servidor, a partir daquele post do Instagram com os nove projetos. Dos nove, escolhi três que fazem sentido pra sua máquina.',
  'Primeiro, o ComfyUI, que já está no ar. Sua placa de vídeo, a RTX 3060 de doze giga, estava completamente parada. O ComfyUI é uma interface pra gerar imagem e vídeo localmente, e agora roda dentro do Docker, na porta oito mil cento e oitenta e oito, enxergando a placa direto. Isso encaixa naquele estudo que a gente já tinha sobre gerar as capas do selo por inteligência artificial, sem depender de serviço pago lá fora.',
  'Segundo, o Strix, uma ferramenta de teste de segurança feita por agentes de inteligência artificial. O que travava ele era precisar de uma chave de modelo. A sacada foi apontar ele pro OmniRoute, o gateway que você já usa pro Claude falar com o Gemini. Testei a ponte e funcionou: o Strix usa o seu Gemini sem gastar chave nova. Instalei ele, mas a execução ficou pra você rodar, porque o modo automático bloqueia disparar agentes desse tipo sozinho.',
  'Terceiro, o Book to Skill, que transforma um livro ou documento técnico numa skill que o agente carrega por capítulo. Combina com a forma como o servidor inteiro é organizado, todo em skills. Baixei, revisei o código inteiro por segurança, e está limpo. A cópia final pra pasta de skills também ficou esperando um comando, por causa do bloqueio do modo automático.',
  'Sobre os que ficaram de fora: o Open Notebook a gente já cobre com o Open WebUI. O OpenSEO depende de uma API paga. O AI Job Search é focado em vagas da Dinamarca. O No AI Slop faz o mesmo que a skill humanizer que você já tem. E o OmniRoute você já tinha.',
  'Resumindo: o ComfyUI já está no ar usando a placa. O Strix está instalado e a ponte com o Gemini está testada. O Book to Skill está baixado, revisado e seguro, esperando só o comando final. Os dois que faltam foram bloqueio do modo automático, não erro.',
];

const idioma: Language = {
  code: 'pt-BR', iso: 'por', name: 'Português (Brasil)', flag: '🇧🇷',
  female: VOZ, male: 'pt-BR-AntonioNeural',
};

export function melhoriasDoServidor(): TranslationResult {
  const sections: SectionItem[] = PARAGRAFOS.map((t, i) => ({
    index: i,
    kind: 'paragraph',
    text: t,
    preview: t.length > 80 ? t.slice(0, 80) + '…' : t,
    spokenText: t,
  }));
  return {
    detectedLanguage: 'por',
    targetLanguage: idioma,
    voice: VOZ,
    rate: '+0%',
    totalSections: sections.length,
    originalText: PARAGRAFOS.join('\n\n'),
    sections,
  };
}
