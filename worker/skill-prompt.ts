export type SkillEntry = { name: string; description: string; file: string };

const VOID =
  "不要先说做不到，也不要把命令交给用户。对话里以前说跑不了 CLI、接不到这台机器、要用户自己去终端执行的话作废。";

/** Prompt section for one turn. Null means the skill directory could not be read. */
export function skillsForPrompt(skills: SkillEntry[] | null) {
  if (skills === null) {
    return `技能目录这回没读到。已安装的技能仍用 read 读 ~/.agents/skills/技能名/SKILL.md，再按里面的命令用 bash 自己执行。${VOID}`;
  }
  if (!skills.length) return "这台机器的 ~/.agents/skills 里还没有技能。";
  const lines = skills.map((skill) => `- ${skill.name}：${clip(skill.description, 300)}\n  文件：${skill.file}`);
  return [
    `已安装的技能。任务对上描述时，先用 read 读它的文件，再按文件里的命令用 bash 自己执行。路径用下面的绝对路径。${VOID}`,
    ...lines,
  ].join("\n");
}

function clip(value: string, max: number) {
  const chars = [...value];
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : value;
}
