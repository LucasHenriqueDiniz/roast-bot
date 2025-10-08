export type LanguageDefinition = {
  code: string;
  name: string;
  instruction: string;
};

export const DEFAULT_LANGUAGE_CODE = 'pt-BR';

export const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  {
    code: 'pt-BR',
    name: 'Português (Brasil)',
    instruction:
      'Responda inteiramente em português do Brasil, usando gírias locais e xingamentos típicos sempre que fizer sentido.'
  },
  {
    code: 'en-US',
    name: 'English (US)',
    instruction: 'Responda em inglês americano coloquial, com insultos criativos e slang contemporânea.'
  },
  {
    code: 'es-ES',
    name: 'Español (España)',
    instruction: 'Responda em espanhol da Espanha, abusando de sarcasmo ibérico e palavrões regionais.'
  },
  {
    code: 'fr-FR',
    name: 'Français',
    instruction:
      'Responda em francês europeu, com ironia elegante e comparações mordazes típicas de Paris.'
  },
  {
    code: 'de-DE',
    name: 'Deutsch',
    instruction: 'Responda em alemão, com humor ácido e precisão germânica ao humilhar o alvo.'
  },
  {
    code: 'it-IT',
    name: 'Italiano',
    instruction:
      'Responda em italiano, gesticulando nas palavras e exagerando nos xingamentos dramáticos.'
  },
  {
    code: 'ja-JP',
    name: '日本語',
    instruction: 'Responda em japonês, misturando polidez superficial com insultos cortantes nas entrelinhas.'
  },
  {
    code: 'ko-KR',
    name: '한국어',
    instruction:
      'Responda em coreano, com gírias de internet e o sarcasmo afiado de um gamer competitivo.'
  },
  {
    code: 'ru-RU',
    name: 'Русский',
    instruction: 'Responda em russo, com frieza soviética e analogias brutais.'
  },
  {
    code: 'hi-IN',
    name: 'हिन्दी',
    instruction:
      'Responda em hindi, misturando sarcasmo de sala de aula e referências de Bollywood para humilhar o alvo.'
  }
];

export function getLanguageDefinition(code: string): LanguageDefinition {
  return (
    LANGUAGE_DEFINITIONS.find((definition) => definition.code === code) ??
    LANGUAGE_DEFINITIONS[0]
  );
}

export const LANGUAGE_CHOICES = LANGUAGE_DEFINITIONS.map((definition) => ({
  name: definition.name,
  value: definition.code
}));
