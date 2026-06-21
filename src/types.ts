export interface UserProfile {
  id: string;
  username: string;
  email: string;
  photoURL?: string;
  bannerURL?: string;
  bio?: string;
  link?: string;
  verified: boolean;
  role: "root_admin" | "admin" | "user";
  restricted: boolean;
  createdAt: any;
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  userPhotoURL?: string;
  userVerified: boolean;
  type: "text" | "image" | "video" | "audio";
  mediaURL?: string;
  caption: string;
  likes: string[]; // array of userIds
  commentsCount: number;
  reportsCount: number;
  createdAt: any;
  // Music & Reels metadata extension
  songId?: string;
  songTitle?: string;
  songArtist?: string;
  songURL?: string;
  songStartSec?: number;
  songDuration?: number;
  isReel?: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  userPhotoURL?: string;
  text: string;
  parentId: string | null; // null for top level comment, string for answers/replies
  createdAt: any;
}

export interface Chat {
  id: string;
  userIds: string[];
  lastMessage?: string;
  lastMessageAt?: any;
  unreadCount?: Record<string, number>; // uid to unread count ratio
  typingState?: Record<string, boolean>; // uid is typing status
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  text: string;
  type: "text" | "image" | "audio";
  mediaURL?: string;
  status: "sent" | "delivered" | "read";
  createdAt: any;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  senderId: string;
  senderUsername: string;
  senderPhotoURL?: string;
  type: "like" | "comment" | "follow" | "message";
  postId?: string;
  text: string;
  read: boolean;
  createdAt: any;
}
