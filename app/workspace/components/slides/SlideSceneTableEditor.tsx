"use client";
import React from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { SlideSceneTableControls as GridControls } from "./SlideSceneTableGridEditor";
import { SlideSceneTableRichTextControls } from "./SlideSceneTableRichTextControls";
export { SlideSceneTableEditor } from "./SlideSceneTableGridEditor";
/** Existing grid editor plus full per-cell typography, sharing the same native table state. */
export function SlideSceneTableControls(props:{object:SlideSceneObject;readOnly:boolean;onPatch:(patch:Partial<SlideSceneObject>)=>void}){
  return <><GridControls {...props}/><SlideSceneTableRichTextControls {...props}/></>;
}
