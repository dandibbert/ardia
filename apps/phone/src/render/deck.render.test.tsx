import { TabDeck } from "../components/tabs/TabDeck";
import { useBrowse } from "../state/browse/store";
import { renderSurface, textOf, unmount, withTabs } from "../../test/render/harness";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("the deck", () => {
  for (const count of [0, 1, 3, 9]) {
    test(`opens with ${count} tabs`, () => {
      withTabs(count);
      useBrowse.setState({ surface: "deck", sheet: null, deckEntrance: null, frozenOrder: null });
      const root = renderSurface(<TabDeck />);
      const text = textOf(root);
      if (count === 0) expect(text).toContain("No Open Tabs");
      else expect(text).toContain(`Site ${count - 1}`);
      unmount(root);
    });
  }

  test("card titles stop growing at 1.35 times text size, as both native apps cap them", () => {
    withTabs(3);
    useBrowse.setState({ surface: "deck", sheet: null, deckEntrance: null, frozenOrder: null });
    const root = renderSurface(<TabDeck />);
    const titles = root.root.findAll((node) => typeof node.type === "string" && node.props.testID === "deckHeaderTitle");
    expect(titles).toHaveLength(3);
    for (const title of titles) expect(title.props.maxFontSizeMultiplier).toBe(1.35);
    unmount(root);
  });
});
