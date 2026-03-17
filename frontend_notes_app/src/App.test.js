import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the Notes app header", () => {
  const { container } = render(<App />);
  const brandTitle = container.querySelector(".brandTitle");
  expect(brandTitle).toBeInTheDocument();
  expect(brandTitle).toHaveTextContent(/^Notes$/);
});
