/* eslint-disable @typescript-eslint/no-explicit-any */
// import "@polymer/paper-dropdown-menu/paper-dropdown-menu";
// import "@polymer/paper-item/paper-item";
// import "@polymer/paper-listbox/paper-listbox";
import {
  LitElement,
  html,
  customElement,
  property,
  CSSResult,
  TemplateResult,
  css,
  PropertyValues,
  internalProperty,
} from 'lit-element';
import {
  HomeAssistant,
  hasConfigOrEntityChanged,
  hasAction,
  ActionHandlerEvent,
  handleAction,
  LovelaceCard,
  LovelaceCardEditor,
  getLovelace,
} from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types

import './editor';

import type { EnhancedArea, EnhancedEntity, EnhancedTemplatesCardConfig, HaPartialCustomElement } from './types';
import { actionHandler } from './action-handler-directive';
import { CARD_VERSION, DEFAULT_AREA_ICON, DEFAULT_SORT_ORDER } from './const';
import { localize } from './localize/localize';

/* eslint no-console: 0 */
console.info(
  `%c  ENHANCED-TEMPLATES-CARD  \n%c  ${localize('common.version')} ${CARD_VERSION}            `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// This puts your card into the UI card picker dialog
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'enhanced-templates-card',
  name: 'Enhanced Templates Settings Card',
  description: 'Update areas or entities with custom settings.',
});

const _ha_entity_picker = async () => {
  if(customElements.get('ha-entity-picker')) return;

  await customElements.whenDefined('partial-panel-resolver');
  const ppr = document.createElement('partial-panel-resolver') as HaPartialCustomElement;
  ppr.hass = {panels: [{
    url_path: "tmp",
    component_name: "developer-tools",
  }]};
  ppr._updateRoutes();

  await ppr.routerOptions.routes.tmp.load()

  await customElements.whenDefined("developer-tools-router");
  const dtr = document.createElement("developer-tools-router") as HaPartialCustomElement;
  await dtr.routerOptions.routes.state.load();
}

const _config_elements = async () => {
  if(customElements.get('ha-area-picker')) return;

  await customElements.whenDefined('partial-panel-resolver');
  const ppr = document.createElement('partial-panel-resolver') as HaPartialCustomElement;
  ppr.hass = {panels: [{
    url_path: "tmp",
    component_name: "config",
  }]};
  ppr._updateRoutes();

  await ppr.routerOptions.routes.tmp.load()

  await customElements.whenDefined("ha-panel-config");
  const cr = document.createElement("ha-panel-config") as HaPartialCustomElement;

  await cr.routerOptions.routes.devices.load();
  await customElements.whenDefined("ha-config-device-page");
  const cdp = document.createElement("ha-config-device-page") as HaPartialCustomElement;
  cdp.firstUpdated({});

  await cr.routerOptions.routes.entities.load();
  await customElements.whenDefined("ha-config-entities");
  const ce = document.createElement("ha-config-entities") as HaPartialCustomElement;
  ce.firstUpdated({});
}


@customElement('enhanced-templates-card')
export class EnhancedTemplateCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    return document.createElement('enhanced-templates-card-editor') as LovelaceCardEditor;
  }

  public static getStubConfig(): object {
    return {};
  }

  // TODO Add any properties that should cause your element to re-render here
  // https://lit-element.polymer-project.org/guide/properties
  @property({ attribute: false }) public hass!: HomeAssistant;
  @internalProperty() private config!: EnhancedTemplatesCardConfig;
  @internalProperty() private _area_id?: string;
  @internalProperty() private _entity_type?: string;
  @internalProperty() private _entity_types: Array<string> = [];
  @internalProperty() private _icon?: string;
  @internalProperty() private _name?: string;
  @internalProperty() private _selectedArea?: EnhancedArea;
  @internalProperty() private _selectedEntity?: EnhancedEntity;
  @internalProperty() private _sortOrder?: number;
  @internalProperty() private _submitting?: boolean;
  @internalProperty() private _visible?: boolean;

  // https://lit-element.polymer-project.org/guide/properties#accessors-custom
  public async setConfig(config: EnhancedTemplatesCardConfig): Promise<void> {
    // TODO Check for required fields and that they are of the proper format
    if (!config) {
      throw new Error(localize('common.invalid_configuration'));
    }

    if (config.test_gui) {
      getLovelace().setEditMode(true);
    }

    this.config = config;

    await _ha_entity_picker();
    await _config_elements();
    await this._load_entity_types();
  }

  protected async _load_entity_types() {
    this._entity_types = await this.hass.callWS({type: 'enhanced_templates_entity_types'});
  }

  // https://lit-element.polymer-project.org/guide/lifecycle#shouldupdate
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }

    return hasConfigOrEntityChanged(this, changedProps, false);
  }

  // https://lit-element.polymer-project.org/guide/templates
  protected render(): TemplateResult | void {
    // TODO Check for stateObj or other necessary things and render a warning if missing
    if (this.config.show_warning) {
      return this._showWarning(localize('common.show_warning'));
    }

    if (this.config.show_error) {
      return this._showError(localize('common.show_error'));
    }

    return this.config.registry === 'area' ? this._areaSettings() : this._entitySettings();
  }

  private _disabled(): boolean {
    if (this._submitting) return true;

    if (this.config.registry === 'area') {
      return !this._selectedArea || this._selectedArea.id === "";
    }

    return !this._selectedEntity || this._selectedEntity.entity_id === "";
  }

  private _areaSettings(): TemplateResult {
    return html`
      <ha-card .header=${localize('title.area')}>
        <div class="card-content">
          <p>${localize('intro.area')}</p>
          <div>
            <ha-area-picker
              .hass=${this.hass}
              .value=${this._selectedArea?.id}
              @value-changed=${this._areaPicked}
            />
            </ha-area-picker>
          </div>
          <div>
            <ha-icon-input
              .value=${this._icon}
              @value-changed=${this._iconChanged}
              .label=${this.hass.localize("ui.dialogs.entity_registry.editor.icon")}
              .placeholder=${DEFAULT_AREA_ICON}
              .disabled=${this._disabled()}
              .errorMessage=${this.hass.localize(
                "ui.dialogs.entity_registry.editor.icon_error"
              )}
            >
            </ha-icon-input>
          </div>
          <paper-input
            .value=${this._name}
            @value-changed=${this._nameChanged}
            .label=${this.hass.localize(
              "ui.dialogs.entity_registry.editor.name"
            )}
            .placeholder=${this._selectedArea?.original_name}
            .disabled=${this._disabled()}
          >
          </paper-input>
          <paper-input
            .value=${this._sortOrder}
            @value-changed=${this._sortOrderChanged}
            pattern="[0-9]+([\.][0-9]+)?"
            type="number"
            .label=${localize('settings.sort_order')}
            .placeholder=${DEFAULT_SORT_ORDER}
            .disabled=${this._disabled()}
          >
          </paper-input>
          <div class="row">
            <ha-switch
              style="--mdc-theme-secondary:var(--switch-checked-color);"
              .checked=${this._visible}
              @change=${this._visibleChanged}
              .disabled=${this._disabled()}
            >
            </ha-switch>
            <div>
              <div class=${this._disabled() ? "disabled" : undefined}>${localize('settings.visible')}</div>
              <div class=${this._disabled() ? "disabled" : "secondary"}>${localize('settings.visible_area_description')}</div>
            </div>
          </div>
        </div>
        <div class="buttons">
              <mwc-button
                @click=${this._updateAreaSettings}
                .disabled=${this._disabled()}
              >
                Update
              </mwc-button>
          </div>
      </ha-card>
    `;
  }

  private _entitySettings(): TemplateResult {
    return html`
      <ha-card .header=${localize('title.entity')}>
        <div class="card-content">
          <p>${localize('intro.entity')}</p>
          <div>
            <ha-entity-picker
              .hass=${this.hass}
              .value=${this._selectedEntity?.entity_id}
              @value-changed=${this._entityPicked}
            />
            </ha-entity-picker>
          </div>
          <div>
            <ha-area-picker
              .hass=${this.hass}
              .value=${this._selectedEntity?.area_id}
              @value-changed=${this._entityAreaPicked}
              .placeholder=${this._selectedEntity?.original_area_id}
              .disabled=${this._disabled()}
            />
            </ha-area-picker>
          </div>
          ${this._entity_types?.length == 0 ? undefined :
            html`
              <paper-dropdown-menu
                class="full-width"
                label-float
                dynamic-align
                .label=${localize('settings.entity_type')}
                .disabled=${this._disabled() || this._entity_types?.length == 0}
                .placeholder=${this._selectedEntity?.original_entity_type}
              >
                <paper-listbox
                  slot="dropdown-content"
                  attr-for-selected="item-name"
                  .selected=${this._selectedEntity?.entity_type || ""}
                  @selected-changed=${this._entityTypePicked}
                >
                  <paper-item item-name="">None</paper-item>
                  ${this._entity_types?.map(type => html`
                    <paper-item item-name=${type}>
                      ${type}
                    </paper-item>
                  `)}
                </paper-listbox>
              </paper-dropdown-menu>
            `
          }
          <paper-input
            .value=${this._sortOrder}
            @value-changed=${this._sortOrderChanged}
            pattern="[0-9]+([\.][0-9]+)?"
            type="number"
            .label=${localize('settings.sort_order')}
            .placeholder=${DEFAULT_SORT_ORDER}
            .disabled=${this._disabled()}
          >
          </paper-input>
          <div class="row">
            <ha-switch
              style="--mdc-theme-secondary:var(--switch-checked-color);"
              .checked=${this._visible}
              @change=${this._visibleChanged}
              .disabled=${this._disabled()}
            >
            </ha-switch>
            <div>
              <div class=${this._disabled() ? "disabled" : undefined} >${localize('settings.visible')}</div>
              <div class=${this._disabled() ? "disabled" : "secondary"}>${localize('settings.visible_area_description')}</div>
            </div>
          </div>
        </div>
        <div class="buttons">
              <mwc-button
                @click=${this._updateEntitySettings}
                .disabled=${this._disabled()}
              >
                Update
              </mwc-button>
          </div>
      </ha-card>
    `;
  }


  private async _areaPicked(ev): Promise<void> {
    if (ev.detail.value === "") {
      this._selectedArea = {id: ev.detail.value};
    } else {
      this._selectedArea = await this.hass.callWS({type: 'enhanced_templates_area_settings', area_id: ev.detail.value})
    }
    this._icon = this._selectedArea?.icon === DEFAULT_AREA_ICON ? undefined : this._selectedArea?.icon;
    this._name = this._selectedArea?.name === this._selectedArea?.original_name ? undefined : this._selectedArea?.name;
    this._sortOrder = this._selectedArea?.sort_order === DEFAULT_SORT_ORDER ? undefined : this._selectedArea?.sort_order;
    this._visible = this._selectedArea?.visible;
  }

  private async _entityPicked(ev): Promise<void> {
    if (ev.detail.value === "") {
      this._selectedEntity = {entity_id: ev.detail.value};
    } else {
      this._selectedEntity = await this.hass.callWS({type: 'enhanced_templates_entity_settings', entity_id: ev.detail.value})
    }
    console.log(this._selectedEntity)
    this._area_id = this._selectedEntity?.area_id === this._selectedEntity?.original_area_id ? undefined : this._selectedEntity?.area_id;
    this._entity_type = this._selectedEntity?.entity_type === this._selectedEntity?.original_entity_type ? undefined : this._selectedEntity?.entity_type;
    this._sortOrder = this._selectedEntity?.sort_order === DEFAULT_SORT_ORDER ? undefined : this._selectedEntity?.sort_order;
    this._visible = this._selectedEntity?.visible;
  }

  private _entityAreaPicked(ev): void {
    this._area_id = ev.detail.value;
  }

  private _entityTypePicked(ev): void {
    this._entity_type = ev.detail.value;
  }

  private _iconChanged(ev): void {
    this._icon = ev.detail.value;
  }

  private _nameChanged(ev): void {
    this._name = ev.detail.value;
  }

  private _sortOrderChanged(ev): void {
    this._sortOrder = ev.detail.value;
  }

  private _visibleChanged(ev): void {
    this._visible = ev.target.checked;
  }

  private _updateAreaSettings(): void {
    this.hass.callService('enhanced_templates', 'set_area', {
      area_id: this._selectedArea?.id,
      icon: this._icon,
      name: this._name,
      sort_order: this._sortOrder,
      visible: this._visible
    })
  }

  private _updateEntitySettings(): void {
    this.hass.callService('enhanced_templates', 'set_entity', {
      entity_id: this._selectedEntity?.entity_id,
      area_id: this._area_id,
      entity_type: this._entity_type,
      sort_order: this._sortOrder,
      visible: this._visible
    })
  }

  private _showWarning(warning: string): TemplateResult {
    return html`
      <hui-warning>${warning}</hui-warning>
    `;
  }

  private _showError(error: string): TemplateResult {
    const errorCard = document.createElement('hui-error-card');
    errorCard.setConfig({
      type: 'error',
      error,
      origConfig: this.config,
    });

    return html`
      ${errorCard}
    `;
  }

  // https://lit-element.polymer-project.org/guide/styles
  static get styles(): CSSResult {
    return css`
      .row {
        margin-top: 8px;
        color: var(--primary-text-color);
        display: flex;
        align-items: center;
      }

      .secondary {
        color: var(--secondary-text-color);
      }

      .disabled {
        color: var(--disabled-text-color);
      }

      .full-width {
        width: 100%;
      }

      .buttons {
        width: 100%;
        box-sizing: border-box;
        border-top: 1px solid var(--mdc-dialog-scroll-divider-color, rgba(0, 0, 0, 0.12));
        display: flex;
        justify-content: space-between;
        flex-direction: row-reverse;
        padding-top: 8px;
        padding-right: 8px;
        padding-left: 8px;
        padding-bottom: max(env(safe-area-inset-bottom), 8px);
      }

      ha-switch {
        margin-right: 16px
      }
    `;
  }

  public getCardSize(): number {
    return 3;
  }
}