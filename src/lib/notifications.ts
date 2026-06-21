import { db } from "./firebase";
import { collection, addDoc } from "firebase/firestore";

/**
 * Triggers an app notification inside Firestore.
 * This runs completely serverless/real-time so the target user receives it instantly.
 */
export async function sendAppNotification(
  recipientId: string,
  senderId: string,
  senderUsername: string,
  senderPhotoURL: string | undefined,
  type: "like" | "comment" | "follow" | "message",
  text: string,
  postId?: string
) {
  if (recipientId === senderId) return; // Don't notify yourself!

  try {
    await addDoc(collection(db, "notifications"), {
      recipientId,
      senderId,
      senderUsername,
      senderPhotoURL: senderPhotoURL || "",
      type,
      postId: postId || "",
      text,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Failed to dispatch notification:", error);
  }
}
