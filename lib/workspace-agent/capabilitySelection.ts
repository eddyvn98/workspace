import {
  describeWorkspaceCapabilities,
  WORKSPACE_CAPABILITY_CATEGORIES,
  type WorkspaceCapabilityCategory,
} from "@/lib/workspace-command-capabilities";
import { runtimeSlideGuidance } from "./runtimeSlideContext";

const CATEGORY_HINTS: Record<WorkspaceCapabilityCategory, RegExp> = {
  content: /text|content|block|document|doc\b|image|icon|description|markdown|edit|rewrite|create|write|rename|title|label|style|background|color|colour|fill|paint|appearance|font|đổi tên|tiêu đề|nhãn|màu nền|màu sắc|nền|tô màu|phong cách|kiểu dáng|văn bản|nội dung|tài liệu|ảnh|biểu tượng|mô tả|chỉnh sửa|tạo/i, // vi-allow
  tree: /child|sibling|parent|reparent|move|attach|duplicate|delete|reorder|branch|node|nhánh|nút|cây|di chuyển|gắn|nhân bản|xóa|sắp xếp/i, // vi-allow
  layout: /layout|arrange|position|transform|coordinate|geometry|reflow|z[-_ ]?order|layer order|paint order|bring to front|bring forward|send backward|send to back|move to front|move to back|stacking order|vị trí|tọa độ|biến đổi|bố trí|dàn trang|căn chỉnh|di chuyển|thứ tự lớp|đưa lên trước|đưa xuống dưới/i, // vi-allow
  relationship: /connector|connect|disconnect|relationship|edge|link|kết nối|đường nối|liên kết/i, // vi-allow
  map: /\bmap\b|mind.?map|tree.?map|timeline|fishbone|org.?chart|treeview|hierarchy|map.?layout|sơ đồ tư duy|bản đồ|xương cá|sơ đồ tổ chức/i, // vi-allow
  diagram: /diagram|flowchart|swimlane|process|workflow|sơ đồ|quy trình|lưu đồ/i, // vi-allow
  table: /table|spreadsheet|workbook|worksheet|sheet|cell|row|column|formula|filter|sort|merge|freeze|bảng|ô dữ liệu|hàng|cột|công thức|lọc|sắp xếp bảng/i, // vi-allow
  presentation: /slide|deck|frame|present|speaker note|trình chiếu|trang chiếu|khung trình bày|ghi chú thuyết trình/i, // vi-allow
  shape: /shape|rectangle|ellipse|sticky|hình|khung|hình khối|chú thích dán/i, // vi-allow
  freehand: /freehand|stroke|handwrite|pen|draw|vẽ tay|nét vẽ|bút/i, // vi-allow
  history: /undo|redo|history|version|restore|lịch sử|khôi phục|hoàn tác|làm lại/i, // vi-allow
  collaboration: /comment|thread|reply|reopen|resolve|share|collaborator|public link|permission|bình luận|mở lại|trả lời|phản hồi|giải quyết|chia sẻ|cộng tác|quyền truy cập/i, // vi-allow
  board: /board|workspace title|export|import|mindmap title|bảng làm việc|tiêu đề workspace|xuất|nhập/i, // vi-allow
  file: /file|pdf|upload|download|attachment|tệp|tải lên|tải xuống|đính kèm/i, // vi-allow
  view: /zoom|pan|camera|focus|select|viewport|phóng to|thu nhỏ|khung nhìn|chọn vùng|tập trung/i, // vi-allow
  image_flow: /image[- ]?flow|image generator|generate image|image generation|luồng ảnh|flow ảnh|tạo ảnh/i, // vi-allow
};

export function selectWorkspaceCapabilities(query: string, mainMode?: string, subMode?: string) {
  const selected = WORKSPACE_CAPABILITY_CATEGORIES.filter((category) => CATEGORY_HINTS[category].test(query));
  if (selected.includes("presentation") && !selected.includes("view")) selected.push("view");
  const categories = selected.length
    ? [...new Set<WorkspaceCapabilityCategory>(["history", ...selected])]
    : [...WORKSPACE_CAPABILITY_CATEGORIES];
  return describeWorkspaceCapabilities(categories, mainMode, subMode).map((capability) => capability.category === "presentation"
    ? { ...capability, guidance: runtimeSlideGuidance(capability.guidance) }
    : capability);
}
