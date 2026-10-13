import type { WorkspaceRuntimeProgressEvent } from "./workspaceChatStream";

type Language = "vi" | "en" | "es" | "fr" | "de" | "pt" | "zh" | "ja" | "ko" | "ru" | "ar" | "th";
type Copy = (count?: number) => string;

const COPY: Record<Language, Record<WorkspaceRuntimeProgressEvent["phase"], Copy>> = {
  vi: {
    model_step: () => "Đang xử lý yêu cầu…", // vi-allow
    executing: () => "Đang áp dụng thay đổi…", // vi-allow
    persisted: (count) => count ? `Đã lưu ${count} thay đổi…` : "Đã lưu thay đổi…", // vi-allow
    completed: () => "Đang hoàn tất câu trả lời…", // vi-allow
  },
  en: {
    model_step: () => "Working on your request…",
    executing: () => "Applying changes…",
    persisted: (count) => count ? `Saved ${count} change${count === 1 ? "" : "s"}…` : "Changes saved…",
    completed: () => "Finishing your reply…",
  },
  es: {
    model_step: () => "Procesando tu solicitud…",
    executing: () => "Aplicando cambios…",
    persisted: (count) => count ? `Se guard${count === 1 ? "ó" : "aron"} ${count} ${count === 1 ? "cambio" : "cambios"}…` : "Cambios guardados…", // vi-allow
    completed: () => "Terminando tu respuesta…",
  },
  fr: {
    model_step: () => "Traitement de votre demande…",
    executing: () => "Application des modifications…",
    persisted: (count) => count ? `${count} modification${count === 1 ? "" : "s"} enregistrée${count === 1 ? "" : "s"}…` : "Modifications enregistrées…", // vi-allow
    completed: () => "Finalisation de votre réponse…", // vi-allow
  },
  de: {
    model_step: () => "Deine Anfrage wird bearbeitet…",
    executing: () => "Änderungen werden angewendet…",
    persisted: (count) => count ? `${count} Änderung${count === 1 ? "" : "en"} gespeichert…` : "Änderungen gespeichert…",
    completed: () => "Antwort wird fertiggestellt…",
  },
  pt: {
    model_step: () => "Processando sua solicitação…", // vi-allow
    executing: () => "Aplicando alterações…", // vi-allow
    persisted: (count) => count ? `${count} alteraç${count === 1 ? "ão" : "ões"} salva${count === 1 ? "" : "s"}…` : "Alterações salvas…", // vi-allow
    completed: () => "Finalizando sua resposta…",
  },
  zh: {
    model_step: () => "正在处理你的请求…",
    executing: () => "正在应用更改…",
    persisted: (count) => count ? `已保存 ${count} 项更改…` : "更改已保存…",
    completed: () => "正在完成回复…",
  },
  ja: {
    model_step: () => "リクエストを処理しています…",
    executing: () => "変更を適用しています…",
    persisted: (count) => count ? `${count} 件の変更を保存しました…` : "変更を保存しました…",
    completed: () => "回答を仕上げています…",
  },
  ko: {
    model_step: () => "요청을 처리하고 있어요…",
    executing: () => "변경 사항을 적용하고 있어요…",
    persisted: (count) => count ? `${count}개 변경 사항을 저장했어요…` : "변경 사항을 저장했어요…",
    completed: () => "답변을 마무리하고 있어요…",
  },
  ru: {
    model_step: () => "Обрабатываю ваш запрос…",
    executing: () => "Применяю изменения…",
    persisted: (count) => count ? `Сохранено изменений: ${count}…` : "Изменения сохранены…",
    completed: () => "Завершаю ответ…",
  },
  ar: {
    model_step: () => "جارٍ معالجة طلبك…",
    executing: () => "جارٍ تطبيق التغييرات…",
    persisted: (count) => count ? `تم حفظ ${count} من التغييرات…` : "تم حفظ التغييرات…",
    completed: () => "جارٍ إنهاء الإجابة…",
  },
  th: {
    model_step: () => "กำลังประมวลผลคำขอ…",
    executing: () => "กำลังใช้การเปลี่ยนแปลง…",
    persisted: (count) => count ? `บันทึกการเปลี่ยนแปลง ${count} รายการแล้ว…` : "บันทึกการเปลี่ยนแปลงแล้ว…",
    completed: () => "กำลังสรุปคำตอบ…",
  },
};

function languageFor(prompt: string): Language {
  if (/[ăâđêôơưĂÂĐÊÔƠƯ]/u.test(prompt) || /\b(?:tiếng việt|tieng viet|hãy|tạo|thêm|xóa|sửa|không)\b/iu.test(prompt)) return "vi"; // vi-allow
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(prompt)) return "ja";
  if (/\p{Script=Hangul}/u.test(prompt)) return "ko";
  if (/\p{Script=Thai}/u.test(prompt)) return "th";
  if (/\p{Script=Arabic}/u.test(prompt)) return "ar";
  if (/\p{Script=Cyrillic}/u.test(prompt)) return "ru";
  if (/\p{Script=Han}/u.test(prompt)) return "zh";

  const text = prompt.toLocaleLowerCase();
  if (/\b(?:português|portuguese|crie|mostre|resuma|solicitação)\b/u.test(text)) return "pt"; // vi-allow
  if (/\b(?:español|spanish|por favor|crear|muestra|resumen|solicitud)\b/u.test(text)) return "es";
  if (/\b(?:français|french|veuillez|créer|montrez|résumé|demande)\b/u.test(text)) return "fr"; // vi-allow
  if (/\b(?:deutsch|german|bitte|erstelle|zeige|zusammenfassen|änderung)\b/u.test(text)) return "de";
  return "en";
}

export function workspaceRuntimeProgressText(
  event: Pick<WorkspaceRuntimeProgressEvent, "phase" | "persistedCount">,
  prompt: string,
): string {
  return COPY[languageFor(prompt)][event.phase](event.persistedCount);
}
