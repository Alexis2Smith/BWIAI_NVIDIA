// Support content for Ask the Institute: crisis and supportive responses in English and Spanish,
// topic detection, and language detection. Kept in one file so a district can review and edit it in one place.
//
// Resources verified against official pages on November 17, 2026:
//   988 Lifeline: 988lifeline.org/get-help (Spanish: press 2, text AYUDA to 988; interpretation in 240+ languages)
//   Childhelp National Child Abuse Hotline: childhelphotline.org/text ((800) 422-4453; text "GO" to 800.422.4453)
//   National Alliance for Eating Disorders: allianceforeatingdisorders.com ((866) 662-1235; weekday support and referral line, not a crisis line)
//   SAMHSA National Helpline: samhsa.gov (1-800-662-HELP (4357); free, confidential, 24/7, English and Spanish)
//   NCMEC Take It Down: takeitdown.ncmec.org (images taken under 18); CyberTipline: missingkids.org/cybertipline
// Review these at least once per school year; numbers and services can change.

// ---------- Language ----------
const ES_HINTS = /\b(qu[eé]|c[oó]mo|por qu[eé]|ayuda|necesito|quiero|tengo|estoy|mi|mis|escuela|hijo|hija|maestr[oa]|est[aá]|puedo|ni[nñ]o|ni[nñ]a|morir|vida|para|pero|muy|tambi[eé]n)\b|[ñ¿¡]/gi;
export function detectLang(text, requested) {
  const r = String(requested || "").toLowerCase();
  if (r === "es" || r === "en") return r;
  const hits = (String(text || "").match(ES_HINTS) || []).length;
  return hits >= 2 ? "es" : "en";
}

// ---------- Topics ----------
// A topic applies when a safety rail flags one of its categories, or when a rail blocks the question
// and its words match. Words alone never trigger anything on a question the rails allowed, so policy
// questions such as "How should a district handle bullying?" are answered normally.
export const TOPICS = {
  crisis: {
    categories: /suicid|self[\s-]*harm/i,
    words: /\b(suicid\w*|kill (my ?self|myself)|end (my|it all)|want to die|self[\s-]*harm|cut(ting)? myself|hurt(ing)? myself|quitarme la vida|matarme|suicid\w*|hacerme da[nñ]o|no quiero vivir)\b/i
  },
  sextortion: {
    categories: /sexual \(minor\)|minor.*sexual|sexual.*minor|child sexual/i,
    words: /\b(sextort\w*|nudes?|naked (photo|picture|pic)s?|explicit (photo|picture|image|video)s?|(photo|picture|pic)s? of me|blackmail\w*|fotos [ií]ntimas|desnud[oa]s?|chantaje\w*)\b/i
  },
  abuse: {
    categories: /child abuse|abuse/i,
    words: /\b(abus\w*|hits? me|beats? me|hurts? me|touch(es|ed)? me|molest\w*|neglect\w*|not safe at home|scared to go home|maltrat\w*|abus[oa]\w*|me pega|me golpea)\b/i
  },
  eating: {
    categories: /eating disorder/i,
    words: /\b(anorexi\w*|bulimi\w*|binge\w*|purg\w*|starv\w*|stop(ped)? eating|not (been )?eating|haven'?t (been )?eat(ing|en)|skip(ping)? meals|eating disorder|throw(ing)? up after eating|trastorno alimentari\w*|anorexia|bulimia|dejar de comer|no como)\b/i
  },
  substance: {
    categories: /controlled|regulated substance|drug/i,
    words: /\b(drugs?|vap(e|ing)|alcohol\w*|drunk|overdos\w*|fentanyl|opioid\w*|pills?|addict\w*|drogas?|adicci[oó]n|borrach\w*)\b/i
  },
  bullying: {
    categories: /harass|bully/i,
    words: /\b(bull(y|ied|ying)|harass\w*|cyberbull\w*|picked on|threatened me|acoso|acosan|me molestan|intimidaci[oó]n)\b/i
  },
  threat: {
    categories: /violence|weapon|explosive|threat/i,
    words: /\b(bomb|explosive|shoot(ing)? up|gun to school|kill (him|her|them|everyone)|bomba|explosivo|disparar)\b/i
  }
};
const ORDER = ["crisis", "sextortion", "abuse", "eating", "substance", "bullying", "threat"];

// Returns the most urgent topic for this block, or null.
export function classify({ categories = [], question = "", railBlocked = false }) {
  const cats = categories.map(String);
  for (const t of ORDER) if (cats.some((c) => TOPICS[t].categories.test(c))) return t;
  if (railBlocked) for (const t of ORDER) if (TOPICS[t].words.test(String(question))) return t;
  return null;
}

// ---------- Responses ----------
const EMERGENCY = {
  en: { label: "Immediate danger", action: "Call 911 or your local emergency number", href: "tel:911" },
  es: { label: "Peligro inmediato", action: "Llame al 911 o a su número de emergencia local", href: "tel:911" }
};
const LIFELINE = {
  en: [
    { label: "988 Suicide and Crisis Lifeline (United States)", action: "Call or text 988", href: "tel:988" },
    { label: "988 Lifeline online chat", action: "Chat at chat.988lifeline.org", href: "https://chat.988lifeline.org/" },
    { label: "Crisis Text Line", action: "Text HOME to 741741", href: "sms:741741" },
    { label: "Other languages: 988 offers interpretation in more than 240 languages", action: "Call 988 and ask for an interpreter", href: "tel:988" }
  ],
  es: [
    { label: "988 Lifeline en español (Estados Unidos)", action: "Marque 988 y luego presione 2", href: "tel:988" },
    { label: "Mensaje de texto en español", action: "Envíe la palabra AYUDA al 988", href: "sms:988" },
    { label: "Sitio de 988 en español", action: "988lifeline.org/es", href: "https://988lifeline.org/es/inicio/" }
  ]
};
const ABROAD = {
  en: { label: "Outside the United States", action: "Find a local helpline at findahelpline.com", href: "https://findahelpline.com" },
  es: { label: "Fuera de los Estados Unidos", action: "Encuentre una línea de ayuda en findahelpline.com", href: "https://findahelpline.com" }
};
const TRUSTED = {
  en: "If you are a student, please also talk with a trusted adult, school counselor, or teacher today. If you are a parent or staff member, you can contact these services for guidance too.",
  es: "Si eres estudiante, habla hoy también con un adulto de confianza, consejero escolar o maestro. Si usted es padre, madre o miembro del personal, también puede comunicarse con estos servicios para recibir orientación."
};

const R = {
  crisis: {
    title: { en: "You are not alone. Support is available right now.", es: "No estás solo. Hay ayuda disponible ahora mismo." },
    message: {
      en: "It sounds like you may be going through something really difficult, and you do not have to face it alone. If you are thinking about suicide or self-harm, or are worried about someone else, please reach out now. Help is free, confidential, and available 24 hours a day.",
      es: "Parece que podrías estar pasando por algo muy difícil, y no tienes que enfrentarlo solo. Si estás pensando en el suicidio o en hacerte daño, o te preocupa otra persona, comunícate ahora. La ayuda es gratuita, confidencial y está disponible las 24 horas."
    },
    resources: (l) => [...LIFELINE[l], ABROAD[l], EMERGENCY[l]]
  },
  sextortion: {
    title: { en: "This is not your fault, and you can get help.", es: "No es tu culpa y puedes recibir ayuda." },
    message: {
      en: "If someone is threatening to share private images of you, or already has, you are the victim, not the one in trouble. Do not send money or more images. Save the messages, block the person, and tell a trusted adult.",
      es: "Si alguien amenaza con compartir imágenes privadas tuyas, o ya lo hizo, tú eres la víctima. No envíes dinero ni más imágenes. Guarda los mensajes, bloquea a la persona y habla con un adulto de confianza."
    },
    resources: (l) => [
      { label: l === "es" ? "Eliminar imágenes tomadas antes de los 18 años" : "Remove images taken when you were under 18", action: "Take It Down: takeitdown.ncmec.org", href: "https://takeitdown.ncmec.org/" },
      { label: l === "es" ? "Reportar la explotación (NCMEC)" : "Report exploitation to NCMEC", action: "CyberTipline: missingkids.org/cybertipline", href: "https://www.missingkids.org/cybertipline" },
      EMERGENCY[l]
    ]
  },
  abuse: {
    title: { en: "You deserve to be safe. Help is available.", es: "Mereces estar seguro. Hay ayuda disponible." },
    message: {
      en: "If someone is hurting you or a child you know, or you do not feel safe at home, you can talk to someone right now. You will be listened to and helped with next steps.",
      es: "Si alguien te está haciendo daño a ti o a un niño que conoces, o no te sientes seguro en casa, puedes hablar con alguien ahora mismo. Te escucharán y te ayudarán con los próximos pasos."
    },
    resources: (l) => [
      { label: l === "es" ? "Childhelp, línea nacional contra el abuso infantil (se habla español)" : "Childhelp National Child Abuse Hotline", action: l === "es" ? "Llame al (800) 422-4453" : "Call (800) 422-4453", href: "tel:18004224453" },
      { label: l === "es" ? "Childhelp por mensaje de texto" : "Childhelp by text", action: l === "es" ? "Envíe GO al 800.422.4453" : "Text GO to 800.422.4453", href: "sms:18004224453" },
      EMERGENCY[l]
    ]
  },
  eating: {
    title: { en: "Struggling with food or your body is real, and support helps.", es: "Las dificultades con la comida o el cuerpo son reales, y el apoyo ayuda." },
    message: {
      en: "Eating disorders are serious and treatable. Talking with someone trained is a strong first step, for you or for someone you care about.",
      es: "Los trastornos alimentarios son serios y tienen tratamiento. Hablar con alguien capacitado es un buen primer paso, para ti o para alguien que te importa."
    },
    resources: (l) => [
      { label: l === "es" ? "National Alliance for Eating Disorders (apoyo y referencias, lunes a viernes de 9:00 a 19:00 ET; no es una línea de crisis)" : "National Alliance for Eating Disorders (support and referrals, weekdays 9:00 a.m. to 7:00 p.m. ET; not a crisis line)", action: l === "es" ? "Llame al (866) 662-1235" : "Call (866) 662-1235", href: "tel:18666621235" },
      { label: l === "es" ? "Si está en crisis, en cualquier momento" : "If you are in crisis, any time", action: l === "es" ? "Marque 988 y luego presione 2" : "Call or text 988", href: "tel:988" },
      EMERGENCY[l]
    ]
  },
  substance: {
    title: { en: "Help with alcohol, vaping, or drugs is available.", es: "Hay ayuda disponible para el alcohol, el vapeo o las drogas." },
    message: {
      en: "Whether the question is about you, your child, or a student, free and confidential help is available any time, in English and Spanish.",
      es: "Ya sea que la pregunta sea sobre usted, su hijo o un estudiante, hay ayuda gratuita y confidencial disponible en cualquier momento, en inglés y en español."
    },
    resources: (l) => [
      { label: l === "es" ? "Línea Nacional de Ayuda de SAMHSA (gratuita, confidencial, 24/7, en inglés y español)" : "SAMHSA National Helpline (free, confidential, 24/7, English and Spanish)", action: "1-800-662-HELP (4357)", href: "tel:18006624357" },
      { label: l === "es" ? "Si alguien no responde o tiene dificultad para respirar" : "If someone is unresponsive or struggling to breathe", action: l === "es" ? "Llame al 911" : "Call 911", href: "tel:911" }
    ]
  },
  bullying: {
    title: { en: "No one deserves to be bullied or harassed.", es: "Nadie merece ser acosado." },
    message: {
      en: "Bullying is not your fault. Tell a trusted adult, teacher, or counselor, and save any messages or screenshots. Schools are required to respond to reports of bullying and harassment.",
      es: "El acoso no es tu culpa. Cuéntale a un adulto de confianza, maestro o consejero, y guarda los mensajes o capturas de pantalla. Las escuelas deben responder a los reportes de acoso."
    },
    resources: (l) => [
      { label: l === "es" ? "Información del gobierno de EE. UU. sobre el acoso" : "U.S. government guidance on bullying", action: "StopBullying.gov", href: "https://www.stopbullying.gov/" },
      { label: l === "es" ? "Si el acoso te hace pensar en hacerte daño" : "If bullying is making you think about hurting yourself", action: l === "es" ? "Marque 988 y luego presione 2" : "Call or text 988", href: "tel:988" },
      EMERGENCY[l]
    ]
  }
};

export const SUPPORT_TOPICS = Object.keys(R);

export function supportResponse(topic, lang = "en") {
  const r = R[topic]; const l = lang === "es" ? "es" : "en";
  return { topic, lang: l, title: r.title[l], message: r.message[l], resources: r.resources(l), trusted: TRUSTED[l] };
}

// Ordinary block messages in Spanish (English versions live in ask.mjs MESSAGES).
export const MESSAGES_ES = {
  pii: "Esta pregunta no se envió porque parece contener información personal (como un número de Seguro Social, correo electrónico, teléfono o fecha de nacimiento). Elimine los datos personales y vuelva a preguntar.",
  content_safety: "Esta pregunta no se envió al asistente porque NVIDIA Content Safety la marcó. Reformúlela como una pregunta sobre la gobernanza de la inteligencia artificial, la adopción responsable o el Instituto.",
  topic_control: "Esta pregunta está fuera de lo que cubre Ask the Institute. Pregunte sobre la gobernanza de la inteligencia artificial, su adopción responsable o los cursos, credenciales y servicios del Instituto.",
  output_safety: "El asistente redactó una respuesta, pero NVIDIA Content Safety la marcó, así que no se mostró. Intente reformular su pregunta.",
  output_pii: "El asistente redactó una respuesta que parecía contener información personal, así que no se mostró. Intente reformular su pregunta.",
  unavailable: "El asistente no está disponible en este momento. Intente de nuevo en unos minutos o escriba a assessments@ascendainow.com."
};
