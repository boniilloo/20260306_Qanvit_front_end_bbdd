-- Limpiar las notificaciones de prueba que se crearon durante el diagnóstico
DELETE FROM public.notification_events
WHERE type = 'rfx_announcement_posted'
  AND title = 'Test notification'
  AND body = 'Test body';

-- Verificar que la función del trigger usa los valores correctos
-- (solo comentario informativo - la función ya está correcta)
COMMENT ON FUNCTION public.create_notifications_on_rfx_announcement() IS
'Creates in-app and email notifications to all companies related to an RFX when an announcement is posted.
Title format: "New announcement: {subject}"
Body format: "{creator_name}" posted a new announcement in RFX "{rfx_name}": {subject}';

