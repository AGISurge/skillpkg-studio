import { fireEvent, render, screen } from "@testing-library/react";
import type { Skill, SkillGroup } from "../types/models";
import SkillGroupsPage from "./SkillGroupsPage";

const mockSkills: Skill[] = Array.from({ length: 20 }, (_, index) => ({
  id: `skill-${index}`,
  name: `Skill ${index}`,
  description: "",
  version: "1",
  author: "Local",
  tags: [],
  files: [],
  type: "skill",
  source: "library",
}));

const mockGroup: SkillGroup = {
  id: "large-group",
  name: "Large group",
  skillIds: mockSkills.map((skill) => skill.id),
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

let mockContentHeight = 240;

jest.mock("../AppContext", () => ({
  useAppContext: () => ({ localSkills: mockSkills }),
  useToolbar: () => undefined,
}));

jest.mock("../SkillGroupsContext", () => ({
  useSkillGroups: () => ({
    groups: [mockGroup],
    loading: false,
    error: "",
    refresh: jest.fn(),
  }),
}));

beforeEach(() => {
  mockContentHeight = 240;
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  Object.defineProperties(HTMLElement.prototype, {
    scrollHeight: {
      configurable: true,
      get() {
        return this.classList.contains("group-card-tags-content")
          ? mockContentHeight
          : 0;
      },
    },
    clientHeight: {
      configurable: true,
      get() {
        return this.classList.contains("group-card-tags-viewport") ? 120 : 0;
      },
    },
  });
});

test("collapses overflowing skill group cards and toggles the full list", () => {
  render(<SkillGroupsPage />);

  const expand = screen.getByRole("button", { name: "展开" });
  expect(expand).toHaveAttribute("aria-expanded", "false");
  expect(document.querySelector(".group-card-tags-viewport")).not.toHaveClass(
    "is-expanded",
  );

  fireEvent.click(expand);

  const collapse = screen.getByRole("button", { name: "收起" });
  expect(collapse).toHaveAttribute("aria-expanded", "true");
  expect(document.querySelector(".group-card-tags-viewport")).toHaveClass(
    "is-expanded",
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  fireEvent.click(collapse);

  expect(screen.getByRole("button", { name: "展开" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("does not show an expand action when all skills fit", () => {
  mockContentHeight = 100;

  render(<SkillGroupsPage />);

  expect(screen.queryByRole("button", { name: "展开" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "收起" })).not.toBeInTheDocument();
});
