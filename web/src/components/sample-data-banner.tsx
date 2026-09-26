import { FlaskConicalIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function SampleDataBanner() {
  return (
    <Alert>
      <FlaskConicalIcon />
      <AlertTitle>Sample data — no live call</AlertTitle>
      <AlertDescription>Layout fixtures for development. Nothing on this page came from Jev or the backend.</AlertDescription>
    </Alert>
  );
}
