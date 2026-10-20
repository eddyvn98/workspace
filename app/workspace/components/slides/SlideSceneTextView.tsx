"use client";
import React from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { richTextFromObject, resolvedSceneTextStyle, sceneParagraphLabels } from "../../types/slideSceneText";
export function SlideSceneTextView({ object, sceneWidth }: { object: SlideSceneObject; sceneWidth: number }) {
  const rich = richTextFromObject(object), labels = sceneParagraphLabels(rich), baseSize = object.fontSize ?? 44;
  const unit = (value: number) => `${value / sceneWidth * 100}cqw`;
  return <div className="flex h-full w-full flex-col" data-scene-rich-text style={{
    justifyContent: object.verticalAlign === "middle" ? "center" : object.verticalAlign === "bottom" ? "flex-end" : "flex-start",
    fontSize: unit(baseSize), fontFamily: object.fontFamily ?? "Arial", color: object.color,
  }}><div>{rich.paragraphs.map((p, index) => <div key={index} style={{
    position: "relative", textAlign: p.align ?? object.align ?? "left", whiteSpace: "pre-wrap", overflowWrap: "anywhere",
    lineHeight: p.lineHeight ?? 1.12, minHeight: "1em", marginTop: unit(p.spaceBefore ?? 0), marginBottom: unit(p.spaceAfter ?? 0),
    paddingLeft: labels[index] ? `${(p.level ?? 0) * 1.2 + 1.2}em` : 0,
  }}>
    {labels[index] && <span aria-hidden style={{ position: "absolute", left: `${(p.level ?? 0) * 1.2}em`, width: "1em", textAlign: "left" }}>{labels[index]}</span>}
    {p.runs.map((run, r) => { const style = resolvedSceneTextStyle(object, run); return <span key={r} style={{
      fontSize: unit(style.fontSize), fontFamily: style.fontFamily, fontWeight: style.bold ? "bold" : "normal", fontStyle: style.italic ? "italic" : "normal",
      textDecoration: [style.underline ? "underline" : "", style.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none", color: style.color, opacity: style.opacity,
    }}>{run.text}</span>; })}
    {!p.runs.some(run => run.text) && <br/>}
  </div>)}</div></div>;
}
