-- Migration: サインアップ時の自動トリガ
-- Topic: auth.users INSERT 時に profile と subscription(free) を自動作成

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- profile を作成 (display_name はメールアドレスの @ より前の部分)
  INSERT INTO public.profile (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    )
  );

  -- subscription を free プランで作成
  INSERT INTO public.subscription (user_id, plan_id, status)
  VALUES (NEW.id, 'free', 'active');

  RETURN NEW;
END;
$$;

-- auth.users への INSERT 時にトリガ発火
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
