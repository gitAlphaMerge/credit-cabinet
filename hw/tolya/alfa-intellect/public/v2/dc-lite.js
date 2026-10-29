// Мост для экранов v2: логика экрана написана как класс Component (state, setState, renderVals),
// разметку рисует petite-vue. После каждого setState результат renderVals() целиком уходит в scope.v.
class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(update, cb) {
    const patch = typeof update === 'function' ? update(this.state, this.props) : update;
    this.state = Object.assign({}, this.state, patch);
    if (this.__update) this.__update();
    if (cb) cb();
  }
  forceUpdate() { if (this.__update) this.__update(); }
}

function mountDC(Component, props) {
  const comp = new Component(props || {});
  const scope = PetiteVue.reactive({ v: comp.renderVals() });
  comp.__update = () => { scope.v = comp.renderVals(); };
  PetiteVue.createApp(scope).mount('#app');
  if (comp.componentDidMount) comp.componentDidMount();
  window.addEventListener('pagehide', () => { if (comp.componentWillUnmount) comp.componentWillUnmount(); });
}
