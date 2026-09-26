"use client";

import { ConfirmModal, ToastView } from "./hub-chrome";
import { ConnectionDrawer } from "./connection-drawer";
import { useIntegrations } from "./integrations-store";
import { CommandPanel, ConnectPanel, FindingPanel, HealthPanel, ProviderInfoPanel, RequestPanel, StaticPanelView } from "./panels-core";
import { AccountingMappingPanel, AccountingRecordPanel, ConflictPanel, EcomOrderPanel, SourceOfTruthPanel } from "./panels-commerce";
import {
  ApiKeyPanel,
  DeliveryPanel,
  GenerateKeyPanel,
  KeySecretPanel,
  LineageNodePanel,
  MappingRowPanel,
  RateLimitPanel,
  SubscribePanel,
  TriggerPanel,
  WebhookAddPanel,
  WebhookSecretPanel,
} from "./panels-developer";

function PanelRouter() {
  const panel = useIntegrations((s) => s.panel);
  if (!panel) return null;
  switch (panel.type) {
    case "connect":
      return <ConnectPanel key={panel.key} providerKey={panel.key} />;
    case "provider-info":
      return <ProviderInfoPanel providerKey={panel.key} />;
    case "finding":
      return <FindingPanel findingKey={panel.findingKey} />;
    case "health":
      return <HealthPanel />;
    case "command":
      return <CommandPanel />;
    case "request":
      return <RequestPanel providerName={panel.providerName} />;
    case "accounting-mapping":
      return <AccountingMappingPanel />;
    case "accounting-record":
      return <AccountingRecordPanel id={panel.id} />;
    case "conflict":
      return <ConflictPanel key={panel.id ?? "first"} id={panel.id} />;
    case "ecom-order":
      return <EcomOrderPanel id={panel.id} />;
    case "source-of-truth":
      return <SourceOfTruthPanel />;
    case "trigger":
      return <TriggerPanel triggerKey={panel.key} />;
    case "subscribe":
      return <SubscribePanel key={`${panel.provider}-${panel.trigger}`} provider={panel.provider} trigger={panel.trigger} />;
    case "generate-key":
      return <GenerateKeyPanel />;
    case "key-secret":
      return <KeySecretPanel name={panel.name} secretKey={panel.key} />;
    case "api-key":
      return <ApiKeyPanel id={panel.id} />;
    case "rate-limit":
      return <RateLimitPanel />;
    case "webhook-add":
      return <WebhookAddPanel />;
    case "webhook-secret":
      return <WebhookSecretPanel event={panel.event} url={panel.url} secret={panel.secret} />;
    case "delivery":
      return <DeliveryPanel webhookId={panel.webhookId} />;
    case "lineage-node":
      return <LineageNodePanel chain={panel.chain} index={panel.index} />;
    case "mapping-row":
      return <MappingRowPanel provider={panel.provider} index={panel.index} />;
    case "static":
      return <StaticPanelView spec={panel.spec} />;
  }
}

/** Every overlay of the module: the connection drawer, the side panel, the confirm modal and the toast. */
export function IntegrationsOverlays() {
  return (
    <>
      <ConnectionDrawer />
      <PanelRouter />
      <ConfirmModal />
      <ToastView />
    </>
  );
}
