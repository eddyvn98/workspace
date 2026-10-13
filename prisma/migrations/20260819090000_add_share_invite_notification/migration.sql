-- Adds the SHARE_INVITE notification type so being given access to a mindmap
-- raises a bell notification, not just a silent row in mindmap_shares.
ALTER TYPE "MindmapNotificationType" ADD VALUE IF NOT EXISTS 'SHARE_INVITE';
