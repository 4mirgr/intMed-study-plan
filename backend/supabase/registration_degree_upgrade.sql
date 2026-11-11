-- Accept the degree already offered by the signup UI without changing approval
-- behavior, existing profiles, function ownership, grants, or trigger bindings.
begin;
do $upgrade$
declare
  target regprocedure := to_regprocedure('public.handle_intmed_user()');
  definition text;
  old_degrees constant text := $degrees$('دانشجوی پزشکی','اینترن','پزشکی عمومی','رزیدنت','متخصص','فلوشیپ','فوق تخصص')$degrees$;
  new_degrees constant text := $degrees$('دانشجوی پزشکی','اینترن','پزشکی عمومی','رزیدنت','متخصص','فلوشیپ','فوق تخصص','سایر')$degrees$;
begin
  if target is null then
    raise exception 'IntMed signup trigger function is not installed';
  end if;
  definition := pg_get_functiondef(target);
  if position(old_degrees in definition)=0
     and length(definition)-length(replace(definition,new_degrees,''))=length(new_degrees) then
    return; -- Already upgraded.
  end if;
  if length(definition)-length(replace(definition,old_degrees,''))<>length(old_degrees)
     or position(new_degrees in definition)>0 then
    raise exception 'Unexpected IntMed degree validation; inspect the installed function before upgrading';
  end if;
  execute replace(definition,old_degrees,new_degrees);
end;
$upgrade$;
commit;
