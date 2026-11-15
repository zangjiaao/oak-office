export type Notice = {
  id: string;
  title: string;
  body: string;
};

/** Newest first. A new top id brings the mark back for anyone who has not opened the rules. */
export const NOTICES: Notice[] = [
  {
    id: "rules",
    title: "公告",
    body: "左上角的制度可以切到公告，看功能更新和调整。有新的一条时，制度上会出现感叹号。点开一次，感叹号只对你消失。",
  },
  {
    id: "water",
    title: "饮水",
    body: "点饮水机可以记下多久喝一次，最短一分钟。到点杯子空了，点一下杯子就算喝过。提醒跟着你，不跟着整层。",
  },
  {
    id: "clock",
    title: "挂钟",
    body: "点墙上的钟可以看这一层的定时。到点的事会自己开始。",
  },
  {
    id: "board",
    title: "看板",
    body: "点墙上的板子可以记还没做、在做和划掉的事。",
  },
  {
    id: "desk",
    title: "工位电脑",
    body: "点开工位上的电脑，可以看这一层共享的文件。",
  },
];

export type NoticeBoard = {
  notices: Notice[];
  unseen: boolean;
};

export async function readNotices(): Promise<NoticeBoard> {
  const body = await send("/api/notices");
  return body as NoticeBoard;
}

export async function seeNotices(): Promise<void> {
  await send("/api/notices", { method: "POST" });
}

async function send(path: string, options?: { method: "POST" }) {
  let response: Response;
  try {
    response = await fetch(path, { method: options?.method ?? "GET" });
  } catch {
    throw new Error("公告没连上。");
  }
  if (!response.ok) throw new Error(await errorMessage(response));
  if (response.status === 204) return {};
  return response.json() as Promise<unknown>;
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* An empty status still needs a sentence. */
  }
  return "公告没连上。";
}
