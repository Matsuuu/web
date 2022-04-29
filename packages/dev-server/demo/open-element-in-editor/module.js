import { html, render } from 'lit-html';
import { LitElement } from 'lit-element';

class MyElement extends LitElement {
  connectedCallback() {
    super.connectedCallback();

  }

  render() {
    return html` <p>Click me to find me in editor</p> `;
  }
}

customElements.define('my-element', MyElement);
