import { describe, expect, it } from "vitest";
import { workspaceRuntimeProgressText } from "@/app/workspace/utils/workspaceRuntimeProgressCopy";

describe("Workspace runtime progress copy", () => {
  it.each([
    ["vi", "Hãy thêm một nhánh", "Đang xử lý yêu cầu…"],
    ["en", "Please add a branch", "Working on your request…"],
    ["es", "Por favor crear una rama", "Procesando tu solicitud…"],
    ["fr", "Veuillez créer une branche", "Traitement de votre demande…"],
    ["de", "Bitte erstelle einen Zweig", "Deine Anfrage wird bearbeitet…"],
    ["pt", "Por favor crie uma seção", "Processando sua solicitação…"],
    ["zh", "请添加一个分支", "正在处理你的请求…"],
    ["ja", "ブランチを追加してください", "リクエストを処理しています…"],
    ["ko", "분기를 추가해 주세요", "요청을 처리하고 있어요…"],
    ["ru", "Добавь новую ветку", "Обрабатываю ваш запрос…"],
    ["ar", "أضف فرعًا جديدًا", "جارٍ معالجة طلبك…"],
    ["th", "เพิ่มสาขาใหม่", "กำลังประมวลผลคำขอ…"],
    ["fallback", "ajouter une branche", "Working on your request…"],
  ])("uses %s progress copy", (_language, prompt, expected) => {
    expect(workspaceRuntimeProgressText({ phase: "model_step" }, prompt)).toBe(expected);
  });

  it("formats saved change counts with singular and plural forms", () => {
    expect(workspaceRuntimeProgressText({ phase: "persisted", persistedCount: 1 }, "Please create a block"))
      .toBe("Saved 1 change…");
    expect(workspaceRuntimeProgressText({ phase: "persisted", persistedCount: 2 }, "Por favor crear una rama"))
      .toBe("Se guardaron 2 cambios…");
    expect(workspaceRuntimeProgressText({ phase: "persisted", persistedCount: 1 }, "Veuillez créer une branche"))
      .toBe("1 modification enregistrée…");
  });
});
