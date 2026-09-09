/** @jest-environment <rootDir>/jest.jsdom.environment.cjs */

import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const Harness = () => {
      const [isChecked, setIsChecked] = React.useState(false);

      return (
        <Checkbox
          label="I understand and want to continue."
          isChecked={isChecked}
          setIsChecked={setIsChecked}
        />
      );
    };

    act(() => {
      root.render(<Harness />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("toggles when the label text is clicked", () => {
    const input = container.querySelector("input") as HTMLInputElement;
    const labelText = container.querySelector(
      ".select-item-label"
    ) as HTMLSpanElement;

    expect(input.checked).toBe(false);

    act(() => {
      labelText.click();
    });
    expect(input.checked).toBe(true);

    act(() => {
      labelText.click();
    });
    expect(input.checked).toBe(false);
  });
});
