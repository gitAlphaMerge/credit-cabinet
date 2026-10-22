import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="loading-screen">
        <h1>Не удалось открыть экран</h1>
        <p>
          Сохранённые данные остаются в базе. Обновите страницу, чтобы
          продолжить.
        </p>
        <button className="button" onClick={() => location.reload()}>
          Обновить страницу
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
