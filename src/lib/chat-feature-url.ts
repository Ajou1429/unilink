import { CHAT_FEATURES, type AssistantTool } from "../../supabase/functions/_shared/chatAssistant.ts";

export function chatFeatureUrl(tool: AssistantTool, basePath: "" | "/unilink" = "") {
  if(!Object.hasOwn(CHAT_FEATURES,tool.feature)) throw new Error("지원하지 않는 기능입니다.");
  const query=new URLSearchParams({chatEmbed:"1"});
  if(tool.feature==="courses" && tool.course_id) query.set("courseId",tool.course_id);
  // GitHub Pages exports route.html; a trailing slash would request route/index.html.
  return `${basePath}${CHAT_FEATURES[tool.feature].path}${basePath ? ".html" : ""}?${query}`;
}
