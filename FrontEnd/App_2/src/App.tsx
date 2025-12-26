// src/App.tsx
import InfraDiagram from "@/features/infra-diagram/InfraDiagram";
import { installNetDebug } from "@/lib/netdebug";

installNetDebug(); // activa logs si ?debug=net o ?debug=1

export default function App() {
  return <InfraDiagram />;
}
